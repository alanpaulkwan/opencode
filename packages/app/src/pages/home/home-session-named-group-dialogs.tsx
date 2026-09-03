import { For, Show, createSignal } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { DialogBody, DialogFooter, DialogHeader, DialogTitleGroup, DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import type { useLanguage } from "@/context/language"
import { trimNamedGroupName, type HomeNamedGroup } from "./home-session-named-groups"

export function HomeNamedGroupNameDialog(props: {
  language: ReturnType<typeof useLanguage>
  title: string
  description: string
  initial: string
  onSave: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = createSignal(props.initial)
  const canSave = () => !!trimNamedGroupName(name())
  const save = () => {
    const trimmed = trimNamedGroupName(name())
    if (!trimmed) return
    props.onSave(trimmed)
  }

  return (
    <DialogV2 fit>
      <DialogHeader hideClose>
        <DialogTitleGroup title={props.title} description={props.description} />
      </DialogHeader>
      <DialogBody class="w-full px-4">
        <TextInputV2
          autofocus
          appearance="large"
          class="w-full"
          style={{ width: "100%" }}
          value={name()}
          aria-label={props.language.t("home.sessions.namedGroup.name")}
          placeholder={props.language.t("home.sessions.namedGroup.name")}
          onInput={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            save()
          }}
        />
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="ghost" onClick={props.onClose}>
          {props.language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2 disabled={!canSave()} onClick={save}>
          {props.language.t("common.save")}
        </ButtonV2>
      </DialogFooter>
    </DialogV2>
  )
}

export function HomeNamedGroupMoveDialog(props: {
  language: ReturnType<typeof useLanguage>
  groups: HomeNamedGroup[]
  currentID?: string
  onSelect: (groupID: string) => void
  onCreate: () => void
  onClose: () => void
}) {
  return (
    <DialogV2 fit>
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={props.language.t("home.sessions.namedGroup.move")}
          description={props.language.t("home.sessions.namedGroup.move.description")}
        />
      </DialogHeader>
      <DialogBody class="flex w-full flex-col gap-1 px-4">
        <ButtonV2 variant="ghost" class="w-full justify-start" onClick={props.onCreate}>
          {props.language.t("home.sessions.namedGroup.new")}
        </ButtonV2>
        <Show when={props.groups.length > 0}>
          <For each={props.groups}>
            {(group) => (
              <ButtonV2
                variant="ghost"
                class="w-full justify-start"
                disabled={group.id === props.currentID}
                onClick={() => props.onSelect(group.id)}
              >
                {group.name}
              </ButtonV2>
            )}
          </For>
        </Show>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="ghost" onClick={props.onClose}>
          {props.language.t("common.cancel")}
        </ButtonV2>
      </DialogFooter>
    </DialogV2>
  )
}

export function HomeNamedGroupDeleteDialog(props: {
  language: ReturnType<typeof useLanguage>
  name: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <DialogV2 fit>
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={props.language.t("home.sessions.namedGroup.delete")}
          description={props.language.t("home.sessions.namedGroup.delete.confirm", { name: props.name })}
        />
      </DialogHeader>
      <DialogFooter>
        <ButtonV2 variant="ghost" onClick={props.onClose}>
          {props.language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2 variant="danger" onClick={props.onConfirm}>
          {props.language.t("common.delete")}
        </ButtonV2>
      </DialogFooter>
    </DialogV2>
  )
}
