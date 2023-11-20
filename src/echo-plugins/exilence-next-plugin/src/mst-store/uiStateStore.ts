import { runInAction } from 'mobx'
import { Instance, cast, getParent, types } from 'mobx-state-tree'
import { Subject, delay, from, interval, map, mergeMap } from 'rxjs'
import { Store, IStore } from './rootStore'
import { v4 as uuidv4 } from 'uuid'
import { ProfileEntry } from './domains/profile'
import { AccountEntry } from './domains/account'
import { IAccountStore } from './accountStore'
import { ISettingStore } from './settingsStore'

export interface IStatusMessage extends Instance<typeof StatusMessage> {}
export interface IUiStateStore extends Instance<typeof UiStateStore> {}

export const StatusMessage = types.model('StatusMessage', {
  message: types.string,
  translateParam: types.maybe(types.union(types.number, types.string)),
  currentCount: types.maybe(types.number),
  totalCount: types.maybe(types.number)
})

export const UiStateStore = types
  .model('UiStateStore', {
    validated: false,
    isValidating: false,
    isSubmitting: false,
    initiated: false,
    isInitiating: false,
    isSnapshotting: false,
    statusMessage: types.safeReference(StatusMessage),
    itemTablePageIndex: 0,
    changingProfile: false,
    counter: 0
  })
  .volatile((self) => ({
    cancelSnapshot: new Subject<boolean>(),
    data: new Subject<number>()
  }))
  .views((self) => ({}))
  .actions((self) => ({
    setCancelSnapshot(cancel: boolean) {
      self.cancelSnapshot.next(cancel)
      if (cancel) {
        this.resetStatusMessage()
        const store = getParent<IStore>(self)
        const accountStore = store.accountStore as IAccountStore
        const settingStore = store.settingStore as ISettingStore
        if (settingStore.autoSnapshotting) {
          accountStore.activeAccount?.dequeueSnapshot()
          accountStore.activeAccount?.queueSnapshot()
        }
        this.setIsSnapshotting(false)
        self.cancelSnapshot.next(!cancel)
      }
    },

    resetStatusMessage() {
      self.statusMessage = undefined
    },

    setValidated(validated: boolean) {
      self.validated = validated
    },

    setValidating(validating: boolean) {
      self.isValidating = validating
    },

    setSubmitting(submitting: boolean) {
      self.isSubmitting = submitting
    },

    setInitiated(init: boolean) {
      self.initiated = init
    },

    setIsInitiating(initiating: boolean) {
      self.isInitiating = initiating
    },

    setIsSnapshotting(snapshotting: boolean = true) {
      self.isSnapshotting = snapshotting
    },

    changeItemTablePage(index: number) {
      self.itemTablePageIndex = index
    },

    setChangingProfile(changing: boolean) {
      self.changingProfile = changing
    }
  }))
  .actions((self) => ({
    afterAttach() {
      self.data.subscribe((x) => {
        this.increment(x)
      })
    },
    increment(val?: number) {
      if (val) {
        self.counter += val
      } else {
        self.counter++
      }
    },
    addAccount() {
      const rootStore = getParent<IStore>(self)
      const profile = ProfileEntry.create({
        uuid: uuidv4(),
        name: `Profile: ${Math.random() * 10}`
      })
      const account = AccountEntry.create({
        uuid: 'Account_' + uuidv4(),
        name: `Account: ${Math.random() * 10}`,
        accountLeagues: [],
        profiles: []
      })
      rootStore.accountStore.addAccount(account)
      rootStore.accountStore.setActiveAccount(account)
      // account.addProfile(profile)
      // account.setActiveProfile(profile)
    },
    addAccountToActiveAccountStore() {
      const rootStore = getParent<IStore>(self)
      const account = AccountEntry.create({
        uuid: 'Account_' + uuidv4(),
        name: `Next Account: ${Math.random() * 10}`,
        accountLeagues: [],
        profiles: []
      })
      rootStore.accountStore.addAccount(account)
    },
    addProfileToActiveAccount() {
      const rootStore = getParent<IStore>(self)
      const profile = ProfileEntry.create({
        uuid: 'Profile_' + uuidv4(),
        name: `Next Profile: ${Math.random() * 10}`
      })
      rootStore.accountStore.activeAccount?.addProfile(profile)
    },
    subscribtion() {
      from([1, 3, 5])
        .pipe(delay(500))
        .subscribe((val) => {
          runInAction(() => {
            this.addProfileToActiveAccount()
          })
        })

      interval(1000)
        .pipe(map((x) => x * 2))
        .subscribe((x) => self.data.next(x))
    }
  }))
