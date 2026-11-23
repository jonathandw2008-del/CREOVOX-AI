import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useParams, Link } from 'react-router-dom'
import { Loader } from 'lucide-react'
import LandingPage from '@/pages/landing/LandingPage'
import { useAppStore } from '@/store/useAppStore'

const FeaturesPage = lazy(() => import('@/pages/landing/FeaturesPage'))
const HowItWorksPage = lazy(() => import('@/pages/landing/HowItWorksPage'))
const StudioLayout = lazy(() => import('@/components/layout/StudioLayout'))
const StudioDashboard = lazy(() => import('@/pages/studio/StudioDashboard'))
const UploadPage = lazy(() => import('@/pages/studio/UploadPage'))
const ProcessPage = lazy(() => import('@/pages/studio/ProcessPage'))
const TranscriptPage = lazy(() => import('@/pages/studio/TranscriptPage'))
const HighlightsPage = lazy(() => import('@/pages/studio/HighlightsPage'))
const EditorPage = lazy(() => import('@/pages/studio/EditorPage'))
const SubtitlesPage = lazy(() => import('@/pages/studio/SubtitlesPage'))
const ThumbnailsPage = lazy(() => import('@/pages/studio/ThumbnailsPage'))
const ContentPage = lazy(() => import('@/pages/studio/ContentPage'))
const AudiencePage = lazy(() => import('@/pages/studio/AudiencePage'))
const ExportPage = lazy(() => import('@/pages/studio/ExportPage'))
const ProjectsPage = lazy(() => import('@/pages/studio/ProjectsPage'))

const MODULES = ['process', 'transcript', 'highlights', 'editor', 'subtitles', 'thumbnails', 'content', 'audience', 'export'] as const

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
      <Loader className="h-8 w-8 animate-spin text-brand-primary" />
    </div>
  )
}

/** /studio/editor → /studio/editor/<current project> */
function ModuleRedirect() {
  const { module } = useParams()
  const { currentProjectId, projects } = useAppStore()
  const id = projects.some((p) => p.id === currentProjectId) ? currentProjectId : projects[0]?.id
  if (!module || !(MODULES as readonly string[]).includes(module)) return <NotFound />
  return <Navigate to={id ? `/studio/${module}/${id}` : '/studio/upload'} replace />
}

function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 font-heading text-4xl font-bold text-text-primary">
        This scene was <span className="serif-accent text-brand-highlight">cut.</span>
      </h1>
      <p className="mt-2 text-text-secondary">The page you're looking for doesn't exist.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/" className="btn-secondary">
          Home
        </Link>
        <Link to="/studio" className="btn-primary">
          Open Studio
        </Link>
      </div>
    </div>
  )
}

function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 120)
      return () => clearTimeout(t)
    }
    window.scrollTo({ top: 0 })
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <>
      <ScrollManager />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/studio" element={<StudioLayout />}>
            <Route index element={<StudioDashboard />} />
            <Route path="upload" element={<UploadPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="process/:id" element={<ProcessPage />} />
            <Route path="transcript/:id" element={<TranscriptPage />} />
            <Route path="highlights/:id" element={<HighlightsPage />} />
            <Route path="editor/:id" element={<EditorPage />} />
            <Route path="subtitles/:id" element={<SubtitlesPage />} />
            <Route path="thumbnails/:id" element={<ThumbnailsPage />} />
            <Route path="content/:id" element={<ContentPage />} />
            <Route path="audience/:id" element={<AudiencePage />} />
            <Route path="export/:id" element={<ExportPage />} />
            <Route path=":module" element={<ModuleRedirect />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  )
}
