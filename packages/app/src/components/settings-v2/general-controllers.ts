import { createMemo, onCleanup, onMount, type Accessor } from "solid-js"
import type { ColorScheme } from "@opencode-ai/ui/theme/context"
import { useTheme } from "@opencode-ai/ui/theme/context"
import {
  monoDefault,
  monoFontFamily,
  monoInput,
  sansDefault,
  sansFontFamily,
  sansInput,
  terminalDefault,
  terminalFontFamily,
  terminalInput,
  useSettings,
} from "@/context/settings"
import { playSoundById, SOUND_OPTIONS } from "@/utils/sound"

export function createAppearanceSettingsController() {
  const settings = useSettings()
  const theme = useTheme()
  const themes = createMemo(() => theme.ids().map((id) => ({ id, name: theme.name(id) })))
  onMount(() => void theme.loadThemes())
  return {
    scheme: {
      current: theme.colorScheme,
      select: (value: ColorScheme) => theme.setColorScheme(value),
    },
    theme: {
      options: themes,
      current: createMemo(() => themes().find((option) => option.id === theme.themeId())),
      select: (option: { id: string } | null) => option && theme.setTheme(option.id),
    },
    fonts: {
      ui: createMemo(() => ({
        value: sansInput(settings.appearance.uiFont()),
        family: sansFontFamily(settings.appearance.uiFont()),
        placeholder: sansDefault,
      })),
      code: createMemo(() => ({
        value: monoInput(settings.appearance.font()),
        family: monoFontFamily(settings.appearance.font()),
        placeholder: monoDefault,
      })),
      terminal: createMemo(() => ({
        value: terminalInput(settings.appearance.terminalFont()),
        family: terminalFontFamily(settings.appearance.terminalFont()),
        placeholder: terminalDefault,
      })),
      setUI: (value: string) => settings.appearance.setUIFont(value),
      setCode: (value: string) => settings.appearance.setFont(value),
      setTerminal: (value: string) => settings.appearance.setTerminalFont(value),
    },
  }
}

const noneSound = { id: "none", label: "sound.option.none" } as const
export const soundOptions = [noneSound, ...SOUND_OPTIONS]
export type SoundSelectOption = (typeof soundOptions)[number]

export function createSoundSettingsController() {
  const settings = useSettings()
  const preview = soundPreview()
  const channel = (
    enabled: Accessor<boolean>,
    current: Accessor<string>,
    setEnabled: (value: boolean) => void,
    set: (id: string) => void,
  ) => ({
    current: createMemo(() =>
      enabled() ? (soundOptions.find((option) => option.id === current()) ?? noneSound) : noneSound,
    ),
    highlight: (option: SoundSelectOption | undefined) => {
      if (!option) return
      preview.play(option.id === "none" ? undefined : option.id)
    },
    select: (option: SoundSelectOption | null) => {
      if (!option) return
      if (option.id === "none") {
        setEnabled(false)
        preview.stop()
        return
      }
      setEnabled(true)
      set(option.id)
      preview.play(option.id)
    },
  })
  return {
    agent: channel(settings.sounds.agentEnabled, settings.sounds.agent, settings.sounds.setAgentEnabled, settings.sounds.setAgent),
    permissions: channel(
      settings.sounds.permissionsEnabled,
      settings.sounds.permissions,
      settings.sounds.setPermissionsEnabled,
      settings.sounds.setPermissions,
    ),
    errors: channel(settings.sounds.errorsEnabled, settings.sounds.errors, settings.sounds.setErrorsEnabled, settings.sounds.setErrors),
  }
}

function soundPreview() {
  const state = { cleanup: undefined as (() => void) | undefined, timeout: undefined as NodeJS.Timeout | undefined, run: 0 }
  const stop = () => {
    state.run += 1
    state.cleanup?.()
    clearTimeout(state.timeout)
    state.cleanup = undefined
  }
  const play = (id: string | undefined) => {
    stop()
    if (!id) return
    const run = ++state.run
    state.timeout = setTimeout(() => {
      void playSoundById(id).then((cleanup) => {
        if (state.run !== run) {
          cleanup?.()
          return
        }
        state.cleanup = cleanup
      })
    }, 100)
  }
  onCleanup(stop)
  return { play, stop }
}

export type AppearanceSettingsController = ReturnType<typeof createAppearanceSettingsController>
export type SoundSettingsController = ReturnType<typeof createSoundSettingsController>
