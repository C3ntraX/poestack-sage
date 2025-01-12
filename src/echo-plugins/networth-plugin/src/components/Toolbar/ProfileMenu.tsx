import { useState } from 'react'
import { useStore } from '../../hooks/useStore'
import { AlertDialog, Button, Command, Popover, Dialog } from 'echo-common/components-v1'
import {
  Check,
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusCircleIcon,
  TrashIcon
} from 'lucide-react'
import ProfileForm from './ProfileForm'
import { Profile } from '../../store/domains/profile'
import { observer } from 'mobx-react'
import { useTranslation } from 'react-i18next'
import { cn } from 'echo-common'

const ProfileMenu = () => {
  const { t } = useTranslation()
  const { accountStore, uiStateStore } = useStore()
  const activeAccount = accountStore.activeAccount
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<Profile | undefined>()
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [deleteProfileDialogOpen, setDeleteProfileDialogOpen] = useState(false)

  const hasProfiles = activeAccount.profiles && activeAccount.profiles?.length > 0

  return (
    <Dialog
      open={profileDialogOpen}
      onOpenChange={(open) => {
        setProfileDialogOpen(open)
        if (!open) {
          setSelectedProfile(undefined)
        }
      }}
    >
      <AlertDialog
        open={deleteProfileDialogOpen}
        onOpenChange={(open) => {
          setDeleteProfileDialogOpen(open)
          if (!open) {
            setSelectedProfile(undefined)
          }
        }}
      >
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          {hasProfiles ? (
            <Popover.Trigger asChild>
              <Button
                variant="ghost"
                className="flex flex-row border rounded h-8 pl-3 pr-2 w-[250px] justify-between"
                role="combobox"
                aria-expanded={menuOpen}
                aria-label={t('label.selectProfile')}
                disabled={!uiStateStore.initiated}
              >
                <span className="truncate">
                  {activeAccount.activeProfile?.name ?? t('label.addProfile')}
                </span>
                {menuOpen ? (
                  <ChevronDownIcon className="flex-shrink-0 ml-2 h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="flex-shrink-0 ml-2 h-4 w-4" />
                )}
              </Button>
            </Popover.Trigger>
          ) : (
            <Dialog.Trigger asChild>
              <Button
                variant="ghost"
                className="border rounded h-8 p-1 pr-1.5 space-x-1"
                role="combobox"
                aria-expanded={menuOpen}
                aria-label={t('label.selectProfile')}
                disabled={!uiStateStore.initiated}
              >
                <PlusCircleIcon className="h-4 w-4" />
                <span className="truncate">{t('label.addProfile')}</span>
              </Button>
            </Dialog.Trigger>
          )}
          <Popover.Content className="w-[250px] p-0">
            <Command>
              {hasProfiles && (
                <>
                  <Command.List>
                    <Command.Group>
                      {activeAccount.profiles.map((profile) => (
                        <Command.Item
                          onSelect={() => {
                            accountStore.activeAccount.setActiveProfile?.(profile)
                            setMenuOpen(false)
                          }}
                          key={profile.uuid}
                        >
                          <Check
                            className={cn(
                              'h-4 w-4 mr-2 flex-shrink-0',
                              activeAccount.activeProfile?.uuid === profile.uuid
                                ? 'opacity-100'
                                : 'opacity-0'
                            )}
                          />
                          <span className="truncate">{profile.name}</span>
                          <Dialog.Trigger asChild>
                            <Button
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setSelectedProfile(profile)
                                setMenuOpen(false)
                                setProfileDialogOpen(true)
                              }}
                              className="ml-auto hover:border-accent-foreground rounded border border-transparent h-8 w-8 shrink-0"
                              size="icon"
                              variant="ghost"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </Button>
                          </Dialog.Trigger>
                          <AlertDialog.Trigger asChild>
                            <Button
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setSelectedProfile(profile)
                                setDeleteProfileDialogOpen(true)
                              }}
                              className="ml-2 hover:border-accent-foreground rounded border border-transparent h-8 w-8 shrink-0"
                              size="icon"
                              variant="ghost"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </Button>
                          </AlertDialog.Trigger>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  </Command.List>
                  <Command.Separator />
                </>
              )}
              <Command.List>
                <Command.Group>
                  <Dialog.Trigger asChild>
                    <Command.Item
                      onSelect={() => {
                        setMenuOpen(false)
                        setProfileDialogOpen(true)
                      }}
                    >
                      <PlusCircleIcon className="mr-2 h-5 w-5" />
                      {t('label.addProfile')}
                    </Command.Item>
                  </Dialog.Trigger>
                </Command.Group>
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover>
        <ProfileForm
          profileDialogOpen={profileDialogOpen}
          profile={selectedProfile}
          onClose={() => {
            setSelectedProfile(undefined)
            setProfileDialogOpen(false)
          }}
        />
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>{`Delete Profile: ${selectedProfile?.name}`} </AlertDialog.Title>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel
              onClick={() => {
                setDeleteProfileDialogOpen(false)
              }}
            >
              {t('action.cancel')}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={() => {
                if (selectedProfile) {
                  activeAccount.deleteProfile(selectedProfile.uuid)
                  setSelectedProfile(undefined)
                  setDeleteProfileDialogOpen(false)
                }
              }}
            >
              {t('action.continue')}
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>
    </Dialog>
  )
}

export default observer(ProfileMenu)
