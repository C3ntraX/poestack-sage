import { computed } from 'mobx'
import {
  detach,
  frozen,
  getRoot,
  idProp,
  model,
  Model,
  modelAction,
  rootRef,
  tProp,
  types
} from 'mobx-keystone'
import { League } from './league'
import { StashTab } from './stashtab'
import { Snapshot } from './snapshot'
import { RootStore } from '../rootStore'
import { Character } from './character'
import externalService from '../../service/external.service'
import {
  catchError,
  concatMap,
  forkJoin,
  from,
  map,
  mergeMap,
  of,
  switchMap,
  takeUntil,
  toArray
} from 'rxjs'
import { IStashTabItems } from '../../interfaces/snapshot.interface'
import { IStashTab } from '../../interfaces/stash.interface'
import {
  createCompactTab,
  mapItemsToPricedItems,
  mapMapStashItemToPoeItem as mapMapStashItemsToPoeItems,
  mergeItemStacks
} from '../../utils/item.utils'
import { PoeItem } from 'sage-common'
import { StashTabSnapshot } from './stashtab-snapshot'
import { diffSnapshots, filterItems, filterSnapshotItems } from '../../utils/snapshot.utils'
import { IPricedItem } from '../../interfaces/priced-item.interface'
import dayjs from 'dayjs'

export const profileLeagueRef = rootRef<League>('nw/profileLeagueRef')
export const profilePriceLeagueRef = rootRef<League>('nw/profilePriceLeagueRef')
export const profileCharacterRef = rootRef<Character>('nw/profileCharacterRef')
export const profileStashTabRef = rootRef<StashTab>('nw/profileStashTabRef', {
  onResolvedValueChange(ref, newNode, oldNode) {
    if (oldNode && !newNode) {
      detach(ref)
    }
  }
})

@model('nw/profile')
export class Profile extends Model({
  uuid: idProp,
  name: tProp(types.string),
  activeLeagueRef: tProp(types.ref(profileLeagueRef)).withSetter(),
  activePriceLeagueRef: tProp(types.ref(profilePriceLeagueRef)).withSetter(),
  activeCharacterRef: tProp(types.maybe(types.ref(profileCharacterRef))).withSetter(),
  activeStashTabsRef: tProp(types.array(types.ref(profileStashTabRef)), []).withSetter(),
  snapshots: tProp(types.array(types.model(Snapshot)), []),
  includeEquipment: tProp(false),
  includeInventory: tProp(false),
  incomeResetAt: tProp(types.maybe(types.number)).withSetter()
}) {
  @computed
  get activeLeague() {
    return this.activeLeagueRef.maybeCurrent
  }
  @computed
  get activePriceLeague() {
    return this.activePriceLeagueRef.maybeCurrent
  }
  @computed
  get activeCharacter() {
    return this.activeCharacterRef?.maybeCurrent
  }
  @computed
  get activeStashTabs() {
    return this.activeStashTabsRef.filter((st) => st.maybeCurrent).map((st) => st.maybeCurrent!)
  }
  @computed
  get isProfileValid() {
    return (
      this.activeLeagueRef.isValid &&
      !this.activeLeague!.deleted &&
      this.activePriceLeagueRef.isValid &&
      !this.activePriceLeague!.deleted &&
      (!this.activeCharacterRef ||
        (this.activeCharacterRef.isValid && !this.activeCharacterRef.current.deleted)) &&
      this.activeStashTabs.every((st) => !st.deleted)
    )
  }
  @computed
  get readyToSnapshot(): boolean {
    const { uiStateStore } = getRoot<RootStore>(this)

    return (
      this.activeStashTabs.length > 0 &&
      // !priceStore.isUpdatingPrices &&
      uiStateStore.initiated &&
      !uiStateStore.isSnapshotting &&
      this.isProfileValid
      // store.rateLimitStore.retryAfter === 0
    )
  }

  @computed
  get items() {
    const { accountStore } = getRoot<RootStore>(this)
    const table = accountStore.activeAccount.networthTableView
    const diffSelected = table.itemTableSelection === 'comparison'
    if (this.snapshots.length === 0 || (diffSelected && this.snapshots.length < 2)) {
      return []
    }
    const showPricedItems = table.showPricedItems
    const showUnpricedItems = table.showUnpricedItems
    if (diffSelected) {
      return filterItems(
        diffSnapshots(this.snapshots[1], this.snapshots[0], this.diffSnapshotPriceResolver),
        showPricedItems,
        showUnpricedItems
      )
    }
    return filterSnapshotItems(
      [this.snapshots[0]],
      showPricedItems,
      showUnpricedItems,
      table.filteredStashTabs
    )
  }

  @computed
  get netWorthOverTime() {
    return this.snapshots
      .slice()
      .sort((a, b) => b.created - a.created)
      .reduce(
        (netWorthSeries, snapshot) => {
          const snapshotTotal = snapshot.stashTabs.reduce((total, tab) => {
            return total + tab.totalValue
          }, 0)
          return [
            ...netWorthSeries,
            { time: snapshot.created, value: parseFloat(snapshotTotal.toFixed(2)) }
          ]
        },
        [] as { time: number; value: number }[]
      )
  }

  netWorthChange(sinceUtc?: number) {
    let snapshots = this.snapshots
    if (sinceUtc) {
      snapshots = this.snapshots.filter((snapshot) => snapshot.created >= sinceUtc)
    }
    if (snapshots.length === 0) {
      return 0
    }

    const latestValue = snapshots[snapshots.length - 1].stashTabs.reduce((total, tab) => {
      return total + tab.totalValue
    }, 0)

    if (snapshots.length === 1) {
      return parseFloat(latestValue.toFixed(2))
    }

    const initialSnapshot = sinceUtc ? snapshots[snapshots.length - 2] : snapshots[0]
    const initialValue = initialSnapshot.stashTabs.reduce((total, tab) => {
      return total + tab.totalValue
    }, 0)
    return parseFloat(latestValue.toFixed(2)) - parseFloat(initialValue.toFixed(2))
  }

  @modelAction
  updateProfile(
    profile: Pick<
      Profile,
      | 'name'
      | 'activeCharacterRef'
      | 'activeStashTabsRef'
      | 'activePriceLeagueRef'
      | 'activeLeagueRef'
      | 'includeEquipment'
      | 'includeInventory'
    >
  ) {
    this.name = profile.name
    this.activeCharacterRef = profile.activeCharacterRef
    this.activeStashTabsRef = profile.activeStashTabsRef
    this.includeEquipment = profile.includeEquipment
    this.includeInventory = profile.includeInventory
    this.activeLeagueRef = profile.activeLeagueRef
    this.activePriceLeagueRef = profile.activePriceLeagueRef
  }

  @modelAction
  snapshot() {
    // TODO: Investigate - disable takesnapshotbutton, when then profile is not valid. - We may just ignore deleted stashtabs/character and mark them in profile as deleted
    // Without a league, the player must investiagte or automatically archive the profile and create a new one? - Only with alertDialog
    if (!this.isProfileValid) return this.notifyInvalidProfile()

    const { uiStateStore } = getRoot<RootStore>(this)
    uiStateStore.setIsSnapshotting(true)
    this.refreshStashTabs()
  }

  @modelAction
  snapshotSuccess() {
    const { accountStore, uiStateStore, notificationStore, settingStore } = getRoot<RootStore>(this)
    uiStateStore.resetStatusMessage()
    notificationStore.createNotification('snapshot', 'success')
    if (settingStore.autoSnapshotting) {
      accountStore.activeAccount.dequeueSnapshot()
      accountStore.activeAccount.queueSnapshot()
    }
    uiStateStore.setIsSnapshotting(false)
    // uiStateStore.setTimeSinceLastSnapshotLabel(undefined)
    // accountStore.activeAccount.activeProfile!.updateNetWorthOverlay()
  }

  @modelAction
  snapshotFail(e?: Error) {
    const { accountStore, uiStateStore, notificationStore, settingStore } = getRoot<RootStore>(this)
    uiStateStore.resetStatusMessage()
    notificationStore.createNotification('snapshot', 'error', true, e)
    if (settingStore.autoSnapshotting) {
      accountStore.activeAccount.dequeueSnapshot()
      accountStore.activeAccount.queueSnapshot()
    }
    uiStateStore.setIsSnapshotting(false)
  }

  @modelAction
  notifyInvalidProfile() {
    const { accountStore, settingStore, uiStateStore, notificationStore } = getRoot<RootStore>(this)
    uiStateStore.resetStatusMessage()
    notificationStore.createNotification('invalid_profile', 'error', true)
    if (settingStore.autoSnapshotting) {
      accountStore.activeAccount.dequeueSnapshot()
      accountStore.activeAccount.queueSnapshot()
    }
    uiStateStore.setIsSnapshotting(false)
  }

  @modelAction
  refreshStashTabs() {
    const { uiStateStore, accountStore } = getRoot<RootStore>(this)
    const league = this.activeLeague!

    uiStateStore.setStatusMessage('refreshing_stash_tabs')

    externalService
      .getStashTabs(league.name)
      .pipe(
        mergeMap((st) => {
          accountStore.activeAccount.updateLeagueStashTabs(st, league)
          return of(this.refreshStashTabsSuccess(league))
        }),
        takeUntil(uiStateStore.cancelSnapshot),
        catchError((e: Error) => of(this.refreshStashTabsFail(e, league.name)))
      )
      .subscribe()
  }

  @modelAction
  refreshStashTabsSuccess(league: League) {
    const { notificationStore } = getRoot<RootStore>(this)
    notificationStore.createNotification(
      'refreshing_stash_tabs',
      'success',
      undefined,
      undefined,
      league.name
    )
    this.getItems(league)
  }

  @modelAction
  refreshStashTabsFail(e: Error, leagueId: string) {
    const { notificationStore } = getRoot<RootStore>(this)
    notificationStore.createNotification('refreshing_stash_tabs', 'error', true, e, leagueId)
    this.snapshotFail()
  }

  @modelAction
  getItems(league: League) {
    const { uiStateStore } = getRoot<RootStore>(this)

    const selectedStashTabs = this.activeStashTabs.filter((st) => !st.deleted)

    if (selectedStashTabs.length === 0) {
      return this.getItemsFail(new Error('no_stash_tabs_selected_for_profile'), league?.name)
    }

    const getMainTabsWithChildren =
      selectedStashTabs.length > 0
        ? from(selectedStashTabs).pipe(
            concatMap((stashTab) =>
              externalService.getStashTabWithChildren(stashTab as IStashTab, league.name)
            ),
            toArray()
          )
        : of([])

    uiStateStore.setStatusMessage('fetching_stash_tab', undefined, 1, selectedStashTabs.length)
    forkJoin([
      getMainTabsWithChildren,
      this.activeCharacter ? externalService.getCharacter(this.activeCharacter.name) : of(null)
    ])
      .pipe(
        switchMap((response) => {
          const combinedTabs = response[0]
          const subTabs = combinedTabs
            .filter((sst) => sst.type !== 'MapStash')
            .filter((sst) => sst.children)
            .flatMap((sst) => sst.children ?? sst)
          if (subTabs.length === 0) {
            response[0] = combinedTabs
            return of(response)
          }
          uiStateStore.setStatusMessage('fetching_subtabs', undefined, 1, subTabs.length)
          const getItemsForSubTabsSource = from(subTabs).pipe(
            concatMap((stashTab) =>
              externalService.getStashTabWithChildren(stashTab as IStashTab, league.name, true)
            ),
            toArray()
          )
          return getItemsForSubTabsSource.pipe(
            mergeMap((subTabs) => {
              response[0] = combinedTabs.map((sst) => {
                if (sst.children) {
                  const children = subTabs.filter((st) => st.parent === sst.id)
                  const childItems = children.flatMap((st) => st.items ?? [])
                  sst.items = (sst.items ?? []).concat(childItems)
                }
                return sst
              })
              return of(response)
            })
          )
        }),
        map((result) => {
          const stashTabsWithItems = result[0].map((tab) => {
            let items: PoeItem[] = []
            if (tab.items) {
              if (tab.type === 'MapStash') {
                items = mapMapStashItemsToPoeItems(tab as IStashTab, league.name)
              } else {
                items = tab.items
              }
            }

            const stashTab = this.activeStashTabs.find(
              (st) => st.id === tab.parent || st.id === tab.id
            )!
            return {
              stashTab: stashTab,
              items: items
            } as IStashTabItems
          })

          const characterWithItems = result[1]
          if (characterWithItems) {
            let includedCharacterItems: PoeItem[] = []
            if (this.includeInventory) {
              if (characterWithItems?.inventory) {
                includedCharacterItems = includedCharacterItems.concat(characterWithItems.inventory)
              }
            }
            if (this.includeEquipment) {
              if (characterWithItems?.equipment) {
                includedCharacterItems = includedCharacterItems.concat(characterWithItems.equipment)
              }
            }
            const characterTab: IStashTabItems = {
              stashTab: 'Equip/Inv',
              items: includedCharacterItems
            }
            stashTabsWithItems.push(characterTab)
          }
          return stashTabsWithItems
        }),
        // Process single to begin with valuation while receiving stasttabs
        mergeMap((stashTabsWithItems) => of(this.getItemsSuccess(stashTabsWithItems, league))),
        takeUntil(uiStateStore.cancelSnapshot),
        catchError((e: Error) => of(this.getItemsFail(e, league.name)))
      )
      .subscribe()
  }

  @modelAction
  getItemsSuccess(stashTabsWithItems: IStashTabItems[], league: League) {
    const { notificationStore } = getRoot<RootStore>(this)
    notificationStore.createNotification('get_items', 'success', undefined, undefined, league.name)
    this.priceItemsForStashTabs(stashTabsWithItems, league)
  }

  @modelAction
  getItemsFail(e: Error, leagueId: string) {
    const { notificationStore } = getRoot<RootStore>(this)
    notificationStore.createNotification('get_items', 'error', true, e, leagueId)
    this.snapshotFail()
  }

  @modelAction
  priceItemsForStashTabs(stashTabsWithItems: IStashTabItems[], league: League) {
    const { uiStateStore, settingStore } = getRoot<RootStore>(this)
    uiStateStore.setStatusMessage('pricing_items')
    const getValuation = from(stashTabsWithItems).pipe(
      mergeMap((stashTabWithItems) => {
        return externalService.valuateItems(league.name, stashTabWithItems.items).pipe(
          toArray(),
          map((valuation) => {
            return {
              valuation,
              stashTab: stashTabWithItems.stashTab
            }
          })
        )
      }),
      toArray()
    )
    forkJoin([getValuation])
      .pipe(
        switchMap(([valuatedStashs]) => {
          return from(valuatedStashs).pipe(
            mergeMap((valuatedStash) => {
              const compactStash = createCompactTab(valuatedStash.stashTab)
              const pricedItems = mapItemsToPricedItems(
                valuatedStash.valuation,
                compactStash,
                settingStore.pvs
              )
              const pricedStackedItems = mergeItemStacks(pricedItems)
              const stashTabId =
                valuatedStash.stashTab instanceof StashTab
                  ? valuatedStash.stashTab.id
                  : compactStash.id
              const stashTabSnapshots = new StashTabSnapshot({
                stashTabId: stashTabId,
                pricedItems: frozen(pricedStackedItems)
              })
              return of(stashTabSnapshots)
            })
          )
        }),
        toArray(),
        switchMap((filteredTabs) => of(this.priceItemsForStashTabsSuccess(filteredTabs))),
        takeUntil(uiStateStore.cancelSnapshot),
        catchError((e: Error) => of(this.priceItemsForStashTabsFail(e)))
      )
      .subscribe()

    // uiStateStore.setStatusMessage('pricing_items')
    // let activePriceLeague = accountStore.activeAccount.activePriceLeague

    // if (!activePriceLeague) {
    //   this.setActivePriceLeague('Standard')
    //   activePriceLeague = accountStore.activeAccount.activePriceLeague
    // }

    // const activePriceDetails = priceStore.leaguePriceDetails.find(
    //   (l) => l.leagueId === activePriceLeague!.id
    // )

    // if (!activePriceDetails) {
    //   return this.priceItemsForStashTabsFail(new Error('no_prices_received_for_league'))
    // }

    // let prices = activePriceDetails.leaguePriceSources[0].prices

    // if (!settingStore.lowConfidencePricing) {
    //   prices = prices.filter((p) => p.count > 10)
    // }

    // if (settingStore.priceThreshold > 0) {
    //   prices = prices.filter((p) => p.calculated && p.calculated >= settingStore.priceThreshold)
    // }

    // prices = excludeLegacyMaps(prices)
    // prices = excludeInvalidItems(prices)

    // const customPrices = customPriceStore.customLeaguePrices.find(
    //   (cpl) => cpl.leagueId === activePriceLeague?.id
    // )?.prices

    // if (customPrices) {
    //   customPrices.filter((x) => {
    //     const foundPrice = findPrice(prices, x)
    //     if (foundPrice) {
    //       foundPrice.customPrice = x.customPrice
    //       const index = prices.indexOf(foundPrice)
    //       prices[index] = foundPrice
    //     }
    //   })
    // }

    // const pricedStashTabs = stashTabsWithItems.map((stashTabWithItems: IStashTabSnapshot) => {
    //   stashTabWithItems.pricedItems = stashTabWithItems.pricedItems.map((item: IPricedItem) => {
    //     return pricingService.priceItem(item, prices)
    //   })
    //   return stashTabWithItems
    // })

    // const filteredTabs = pricedStashTabs.map((pst) => {
    //   const mergedTabItems = mergeItemStacks(pst.pricedItems).filter(
    //     (pi) => pi.total >= rootStore.settingStore.totalPriceThreshold && pi.total > 0
    //   )
    //   pst.pricedItems = mergedTabItems
    //   pst.value = mergedTabItems.map((ts) => ts.total).reduce((a, b) => a + b, 0)
    //   return pst
    // })

    // return this.priceItemsForStashTabsSuccess(filteredTabs)
  }

  @modelAction
  priceItemsForStashTabsSuccess(pricedStashTabs: StashTabSnapshot[]) {
    const { notificationStore } = getRoot<RootStore>(this)
    notificationStore.createNotification('price_stash_items', 'success')
    this.saveSnapshot(pricedStashTabs)
  }

  @modelAction
  priceItemsForStashTabsFail(e: Error) {
    const { notificationStore } = getRoot<RootStore>(this)
    notificationStore.createNotification('price_stash_items', 'error', true, e)
    this.snapshotFail()
  }

  @modelAction
  saveSnapshot(pricedStashTabs: StashTabSnapshot[]) {
    const { uiStateStore } = getRoot<RootStore>(this)
    uiStateStore.setStatusMessage('saving_snapshot')

    const snapshotToAdd = new Snapshot({
      stashTabs: pricedStashTabs
    })

    this.snapshots.unshift(snapshotToAdd)
    this.snapshots = this.snapshots.slice(0, 1000)

    this.snapshotSuccess()
  }

  diffSnapshotPriceResolver(removedItems: IPricedItem[]) {
    // TODO: use some flow generator function & convert PricedItem to PoeItem, that it can priced again or save the PoeItem in the PricedItem
    return 0

    if (removedItems.length === 0) return
    const { accountStore, leagueStore } = getRoot<RootStore>(this)
    let activePriceLeague = accountStore.activeAccount.activePriceLeague

    if (!activePriceLeague) {
      this.setActivePriceLeagueRef(profilePriceLeagueRef(leagueStore.priceLeagues[0]))
      activePriceLeague = accountStore.activeAccount.activePriceLeague
    }

    removedItems.forEach((item) => {
      // const lastPricedItem = findPriceForItem(prices, item)
      // if (lastPricedItem) {
      //   // Update reference - stackSize is already negativ
      //   item.total = item.stackSize * lastPricedItem
      // }
      // yield 5
    })
  }
}
