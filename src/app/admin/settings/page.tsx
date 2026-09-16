'use client'

import { useAdmin } from '../layout'
import { SettingsTab } from '@/app/admin/settings/SettingsTab'

export default function SettingsPage() {
  const {
    token,
    settings,
    setSettings,
    tags,
    settingsLoading,
    settingsSaving,
    settingsError,
    handleSaveSettings,
    t,
    notify,
    handleUnauthorized,
  } = useAdmin()

  return (
    <SettingsTab
      token={token}
      settings={settings}
      setSettings={setSettings}
      tags={tags}
      loading={settingsLoading}
      saving={settingsSaving}
      error={settingsError}
      onSave={handleSaveSettings}
      t={t}
      notify={notify}
      onUnauthorized={handleUnauthorized}
    />
  )
}
