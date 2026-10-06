import { SettingsTabs } from "@/components/app/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <SettingsTabs />
      {children}
    </div>
  );
}
