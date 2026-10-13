import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/server/auth";
import { Sidebar, BottomNav, MobileHeader } from "@/components/nav";
import { FeedbackButton } from "@/components/feedback-button";
import { PollGate } from "@/components/poll-gate";
import { PushPermissionGate } from "@/components/push-permission-gate";
import { UpdatesGate } from "@/components/updates-gate";
import { GymNameGate } from "@/components/gym-name-gate";
import { OnboardingTutorial } from "@/components/onboarding-tutorial";
import { OfflineManager } from "@/components/offline-manager";
import { PageTransition } from "@/components/page-transition";
import { AppSplash } from "@/components/app-splash";
import { RestTimerProvider } from "@/components/rest-timer-provider";
import { FloatingDock } from "@/components/floating-dock";
import { PresencePing } from "@/components/presence-ping";
import { WorkoutDeviceNotification } from "@/components/workout-device-notification";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();
  if (!session) redirect("/login");

  return (
    // El temporizador de descanso vive aquí: así no se reinicia al navegar
    // entre pestañas y su banner flotante es común a toda la app.
    <RestTimerProvider>
      <div className="min-h-dvh">
        <Sidebar />
        <MobileHeader />
        <main className="px-4 pb-36 pt-[calc(4.5rem+env(safe-area-inset-top))] md:ml-60 md:px-8 md:pb-10 md:pt-8">
          <div className="mx-auto max-w-5xl"><PageTransition>{children}</PageTransition></div>
        </main>
        <FloatingDock />
        <FeedbackButton />
        <PollGate />
        <PushPermissionGate />
        <UpdatesGate />
        <GymNameGate />
        <OnboardingTutorial />
        <OfflineManager />
        <PresencePing />
        <WorkoutDeviceNotification />
        <AppSplash />
        <BottomNav />
      </div>
    </RestTimerProvider>
  );
}
