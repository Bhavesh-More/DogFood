import { lazy } from "react";
import { createBrowserRouter } from "react-router";
import { Shell } from "./app/Shell";
import { LoginPage, RegisterPage } from "./pages/auth/Auth";
import { HomePage } from "./pages/Home";
import { NotFoundPage } from "./pages/NotFound";

const named = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const EventsPage = named(() => import("./pages/Events"), "EventsPage");
const EventPage = named(() => import("./pages/EventPage"), "EventPage");
const GalleryPage = named(() => import("./pages/Gallery"), "GalleryPage");
const ProjectPage = named(() => import("./pages/Project"), "ProjectPage");
const ResultsPage = named(() => import("./pages/Results"), "ResultsPage");
const InvitePage = named(() => import("./pages/Invites"), "InvitePage");
const JudgeInvitePage = named(() => import("./pages/Invites"), "JudgeInvitePage");
const DashboardPage = named(() => import("./pages/participant/Dashboard"), "DashboardPage");
const TeamPage = named(() => import("./pages/participant/Team"), "TeamPage");
const SubmitPage = named(() => import("./pages/participant/Submit"), "SubmitPage");
const JudgeHomePage = named(() => import("./pages/judge/JudgeHome"), "JudgeHomePage");
const JudgeQueuePage = named(() => import("./pages/judge/JudgeQueue"), "JudgeQueuePage");
const ScorePage = named(() => import("./pages/judge/Score"), "ScorePage");
const PairwisePage = named(() => import("./pages/judge/Pairwise"), "PairwisePage");
const OrganizeHomePage = named(() => import("./pages/organize/OrganizeHome"), "OrganizeHomePage");
const CreateEventPage = named(() => import("./pages/organize/CreateEvent"), "CreateEventPage");
const OrganizeLayout = named(() => import("./pages/organize/OrganizeLayout"), "OrganizeLayout");
const OverviewPage = named(() => import("./pages/organize/Overview"), "OverviewPage");
const SettingsPage = named(() => import("./pages/organize/Settings"), "EventSettingsPage");
const SetupPage = named(() => import("./pages/organize/Setup"), "SetupPage");
const RubricPage = named(() => import("./pages/organize/Rubric"), "RubricPage");
const SubmissionsPage = named(() => import("./pages/organize/Submissions"), "SubmissionsPage");
const JudgesPage = named(() => import("./pages/organize/Judges"), "JudgesPage");
const NormalizationPage = named(() => import("./pages/organize/Normalization"), "NormalizationPage");
const VotesPage = named(() => import("./pages/organize/Votes"), "VotesPage");
const AuditPage = named(() => import("./pages/organize/Audit"), "AuditPage");
const IntegrationsPage = named(() => import("./pages/organize/Integrations"), "IntegrationsPage");
const AdminPage = named(() => import("./pages/admin/Admin"), "AdminPage");
const VerifyPage = named(() => import("./pages/Verify"), "VerifyPage");
const EmbedPage = named(() => import("./pages/Embed"), "EmbedPage");
const ApiDocsPage = named(() => import("./pages/ApiDocs"), "ApiDocsPage");
const AccountPage = named(() => import("./pages/Account"), "AccountPage");
const ProfilePage = named(() => import("./pages/Profile"), "ProfilePage");
const NotificationsPage = named(() => import("./pages/Notifications"), "NotificationsPage");

export const router = createBrowserRouter([
  { path: "/embed/:slug", element: <EmbedPage /> },
  {
    element: <Shell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "events", element: <EventsPage /> },
      { path: "e/:slug", element: <EventPage /> },
      { path: "e/:slug/gallery", element: <GalleryPage /> },
      { path: "e/:slug/p/:id", element: <ProjectPage /> },
      { path: "e/:slug/results", element: <ResultsPage /> },
      { path: "e/:slug/team", element: <TeamPage /> },
      { path: "e/:slug/submit", element: <SubmitPage /> },
      { path: "invite/:token", element: <InvitePage /> },
      { path: "judge-invite/:token", element: <JudgeInvitePage /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "u/:userId", element: <ProfilePage /> },
      { path: "judge", element: <JudgeHomePage /> },
      { path: "judge/:slug", element: <JudgeQueuePage /> },
      { path: "judge/:slug/a/:assignmentId", element: <ScorePage /> },
      { path: "judge/:slug/pairwise", element: <PairwisePage /> },
      { path: "organize", element: <OrganizeHomePage /> },
      { path: "organize/new", element: <CreateEventPage /> },
      {
        path: "organize/:slug",
        element: <OrganizeLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "setup", element: <SetupPage /> },
          { path: "rubric", element: <RubricPage /> },
          { path: "submissions", element: <SubmissionsPage /> },
          { path: "judges", element: <JudgesPage /> },
          { path: "results", element: <NormalizationPage /> },
          { path: "votes", element: <VotesPage /> },
          { path: "audit", element: <AuditPage /> },
          { path: "integrations", element: <IntegrationsPage /> },
        ],
      },
      { path: "admin", element: <AdminPage /> },
      { path: "verify/:id", element: <VerifyPage /> },
      { path: "api-docs", element: <ApiDocsPage /> },
      { path: "settings", element: <AccountPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
