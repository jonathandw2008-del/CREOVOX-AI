"""Provider-agnostic structured generation (Groq or Anthropic).

`generate_json(...)` returns a validated Pydantic instance of `schema`. The active provider is
chosen by `settings.active_ai_provider` (AI_PROVIDER=auto picks Groq when GROQ_API_KEY is set).
"""
from __future__ import annotations

import base64
import copy
import json
import logging
import os
from typing import Any, Literal, TypeVar

from pydantic import BaseModel, ValidationError

from app.config import settings

log = logging.getLogger("creovox.ai")

T = TypeVar("T", bound=BaseModel)
Effort = Literal["low", "medium", "high"]


class AIUnavailable(Exception):
    """No AI provider is configured."""


class AIError(Exception):
    def __init__(self, message: str, status_code: int = 502, code: str = "ai_error"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


def ai_enabled() -> bool:
    return settings.ai_enabled


def provider_name() -> str | None:
    return settings.active_ai_provider


# --------------------------------------------------------------------------- #
# JSON schema helpers                                                          #
# --------------------------------------------------------------------------- #

_DROP_KEYS = {"title", "default", "examples"}


def strict_schema(model: type[BaseModel]) -> dict:
    """Pydantic JSON schema → strict structured-output schema.

    Inlines $refs, drops titles/defaults, and marks every object as
    `additionalProperties: false` with all properties required.
    """
    raw = model.model_json_schema()
    defs = raw.pop("$defs", {}) or raw.pop("definitions", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                name = node["$ref"].split("/")[-1]
                target = copy.deepcopy(defs[name])
                extra = {k: v for k, v in node.items() if k != "$ref"}
                target.update(extra)
                return resolve(target)
            out = {k: resolve(v) for k, v in node.items() if k not in _DROP_KEYS and k != "properties"}
            if "properties" in node:
                # Property names are data, not annotations: never drop a field called "title" etc.
                out["properties"] = {name: resolve(sub) for name, sub in node["properties"].items()}
            if out.get("type") == "object" or "properties" in out:
                props = out.get("properties", {})
                out["type"] = "object"
                out["properties"] = props
                out["required"] = list(props.keys())
                out["additionalProperties"] = False
            return out
        if isinstance(node, list):
            return [resolve(x) for x in node]
        return node

    return resolve(raw)


def _schema_name(schema: type[BaseModel]) -> str:
    return "".join(c if c.isalnum() or c in "_-" else "_" for c in schema.__name__)[:64] or "output"


def _validate(schema: type[T], text: str) -> T:
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    return schema.model_validate_json(text)


# --------------------------------------------------------------------------- #
# Groq                                                                         #
# --------------------------------------------------------------------------- #

_groq_client = None


def _groq():
    global _groq_client
    if _groq_client is None:
        import groq

        key = settings.groq_api_key or os.environ.get("GROQ_API_KEY")
        _groq_client = groq.Groq(api_key=key, timeout=120.0, max_retries=2)
    return _groq_client


def _groq_error(e: Exception) -> AIError:
    import groq

    if isinstance(e, groq.RateLimitError):
        return AIError("The AI service is rate limited. Please try again in a minute.", 429, "ai_rate_limited")
    if isinstance(e, (groq.AuthenticationError, groq.PermissionDeniedError)):
        return AIError("The AI service rejected the API key. Check GROQ_API_KEY.", 503, "ai_auth")
    if isinstance(e, groq.APIConnectionError):  # includes APITimeoutError
        return AIError("Could not reach the AI service. Check the server's internet connection.", 503, "ai_unreachable")
    if isinstance(e, groq.APIStatusError):
        try:
            detail = e.response.text[:500]
        except Exception:
            detail = ""
        log.warning("groq error %s: %s", e.status_code, detail)
        return AIError(f"The AI service returned an error ({e.status_code}).", 502, "ai_error")
    return AIError(f"AI request failed: {e}", 502, "ai_error")


def _groq_generate(*, system: str, prompt: str, schema: type[T], context: str | None, images: list[bytes] | None, effort: Effort, max_tokens: int) -> T:
    import groq

    client = _groq()
    sch = strict_schema(schema)
    vision = bool(images)
    model = settings.groq_vision_model if vision else settings.groq_model

    def build_messages(extra: str | None, describe_schema: bool) -> list[dict]:
        sys_text = system
        if describe_schema:
            sys_text += "\n\nRespond with ONLY a JSON object that matches this JSON Schema exactly:\n" + json.dumps(sch)
        user_text = (f"<context>\n{context}\n</context>\n\n" if context else "") + prompt
        if extra:
            user_text += "\n\n" + extra
        if vision:
            content: list[dict] | str = [{"type": "text", "text": user_text}] + [
                {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(img).decode()}} for img in images or []
            ]
        else:
            content = user_text
        return [{"role": "system", "content": sys_text}, {"role": "user", "content": content}]

    json_schema_format = {"type": "json_schema", "json_schema": {"name": _schema_name(schema), "schema": sch, "strict": True}}
    use_json_schema = True
    extra: str | None = None
    last_err: Exception | None = None

    for attempt in range(3):
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": build_messages(extra, describe_schema=not use_json_schema),
            "max_completion_tokens": max_tokens,
            "response_format": json_schema_format if use_json_schema else {"type": "json_object"},
        }
        if model.startswith("openai/gpt-oss"):
            kwargs["reasoning_effort"] = effort
        try:
            resp = client.chat.completions.create(**kwargs)
        except groq.BadRequestError as e:
            # Some models (vision) may not support strict json_schema → fall back to JSON mode once.
            if use_json_schema and vision:
                use_json_schema = False
                last_err = e
                continue
            raise _groq_error(e) from e
        except groq.GroqError as e:
            raise _groq_error(e) from e

        choice = resp.choices[0]
        text = choice.message.content or ""
        if getattr(resp, "usage", None):
            log.info("groq %s tokens=%s", model, getattr(resp.usage, "total_tokens", "?"))
        try:
            return _validate(schema, text)
        except (ValidationError, ValueError) as e:
            last_err = e
            if choice.finish_reason == "length":
                extra = "Your previous answer was cut off. Be more concise so the full JSON fits."
            else:
                extra = f"Your previous answer did not match the schema ({str(e)[:400]}). Return valid JSON only."
            if attempt >= 1:
                break
    raise AIError(f"The AI returned an invalid response: {str(last_err)[:200]}", 502, "ai_bad_output")


# --------------------------------------------------------------------------- #
# Anthropic                                                                    #
# --------------------------------------------------------------------------- #

_anthropic_client = None


def _anthropic():
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic

        _anthropic_client = anthropic.Anthropic(api_key=settings.anthropic_api_key or None, max_retries=2)
    return _anthropic_client


def _anthropic_error(e: Exception) -> AIError:
    import anthropic

    if isinstance(e, anthropic.RateLimitError):
        return AIError("The AI service is rate limited. Please try again in a minute.", 429, "ai_rate_limited")
    if isinstance(e, (anthropic.AuthenticationError, anthropic.PermissionDeniedError)):
        return AIError("The AI service rejected the API key. Check ANTHROPIC_API_KEY.", 503, "ai_auth")
    if isinstance(e, anthropic.APIConnectionError):
        return AIError("Could not reach the AI service. Check the server's internet connection.", 503, "ai_unreachable")
    if isinstance(e, anthropic.APIStatusError):
        return AIError(f"The AI service returned an error ({e.status_code}).", 502, "ai_error")
    return AIError(f"AI request failed: {e}", 502, "ai_error")


def _anthropic_generate(*, system: str, prompt: str, schema: type[T], context: str | None, images: list[bytes] | None, effort: Effort, max_tokens: int) -> T:
    import anthropic

    client = _anthropic()
    content: list[dict] = []
    if context:
        content.append({"type": "text", "text": f"<context>\n{context}\n</context>", "cache_control": {"type": "ephemeral"}})
    for img in images or []:
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(img).decode()}})
    content.append({"type": "text", "text": prompt})

    try:
        with client.beta.messages.stream(
            model=settings.claude_model,
            max_tokens=max(max_tokens, 16000),
            system=system,
            messages=[{"role": "user", "content": content}],
            output_format=schema,
            output_config={"effort": effort},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            msg = stream.get_final_message()
    except anthropic.AnthropicError as e:
        raise _anthropic_error(e) from e

    if msg.stop_reason == "refusal":
        raise AIError("The AI declined to process this content.", 422, "ai_refused")
    if msg.stop_reason == "max_tokens":
        raise AIError("The AI response was cut off. Try a shorter input.", 502, "ai_truncated")
    parsed = msg.parsed_output
    if parsed is None:
        text = "".join(getattr(b, "text", "") for b in msg.content if getattr(b, "type", "") == "text")
        try:
            return _validate(schema, text)
        except (ValidationError, ValueError) as e:
            raise AIError("The AI returned an invalid response.", 502, "ai_bad_output") from e
    return parsed


# --------------------------------------------------------------------------- #
# Public entry point                                                           #
# --------------------------------------------------------------------------- #


def generate_json(
    *,
    system: str,
    prompt: str,
    schema: type[T],
    context: str | None = None,
    images: list[bytes] | None = None,
    effort: Effort = "medium",
    max_tokens: int = 8000,
) -> T:
    provider = settings.active_ai_provider
    if provider is None:
        raise AIUnavailable("No AI provider is configured (set GROQ_API_KEY or ANTHROPIC_API_KEY).")
    kwargs = dict(system=system, prompt=prompt, schema=schema, context=context, images=images, effort=effort, max_tokens=max_tokens)
    if provider == "groq":
        return _groq_generate(**kwargs)
    if provider == "anthropic":
        return _anthropic_generate(**kwargs)
    raise AIUnavailable(f"Unknown AI provider: {provider}")
