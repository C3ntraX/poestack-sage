'use client'

import { currentUserAtom } from '@/components/providers'
import { useToast } from '@/hooks/useToast'
import { NotificationBody, NotificationItem } from '@/hooks/useWhisperHash'
import {
  Notification,
  listMyListings,
  listNotifications,
  listSummaries,
  listValuations
} from '@/lib/http-util'
import { LISTING_CATEGORIES } from '@/lib/listing-categories'
import { calculateListingFromOfferingListing } from '@/lib/listing-util'
import { useNotificationStore } from '@/store/notificationStore'
import { SageItemGroupSummaryShard } from '@/types/echo-api/item-group'
import { SageValuationShard } from '@/types/echo-api/valuation'
import {
  SageListingType,
  SageOfferingType,
  SageSelectedDatabaseOfferingItemType
} from '@/types/sage-listing-type'
import { useQueries, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useAtomValue } from 'jotai'
import { PackageSearchIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { ReactNode, memo, useEffect, useMemo, useRef, useState } from 'react'
import CurrencyDisplay from './currency-display'
import { Button } from './ui/button'
import { Tooltip, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { useTranslation } from 'react-i18next'

type ParsedNotification = Omit<Notification, 'body'> & {
  body: string | { listing: SageOfferingType; requestedItems?: NotificationItem[]; ign: string }
}

export type ToastData = {
  listing: SageListingType
  created: number
  type: string
  buyer: string
  ign: string
  toastBody: ReactNode
}

interface NotificationHandlerProps {}

// Tutorial: https://ui.shadcn.com/docs/components/data-table
const Notifier = () => {
  const { t } = useTranslation(['common', 'notification'])
  const openTradeOverviewInNewWindow = useNotificationStore(
    (state) => state.openTradeOverviewInNewWindow
  )

  const [fetchTimeStamp, setFetchTimestamp] = useState(dayjs.utc().valueOf() - 2000)
  const currentUser = useAtomValue(currentUserAtom)
  const listedNotifications = useRef<Record<string, boolean>>({})
  const toast = useToast()

  const { data: notifications } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: ['notifications'],
    queryFn: async () => {
      const notifications = await listNotifications(fetchTimeStamp)
      const nextMs = dayjs.utc().valueOf()
      setFetchTimestamp(nextMs - 2000)
      return notifications
    },
    // We do not save any cache - this has the effect, that the query starts directly after changing the category
    gcTime: 0,
    enabled: !!currentUser,
    refetchInterval: 2000,
    retry: true
  })

  const { data: allListings } = useQuery({
    queryKey: [currentUser?.profile?.uuid, 'my-listings'],
    queryFn: () => listMyListings().then((res) => res.filter((l) => !l.deleted)),
    enabled: !!currentUser?.profile?.uuid
  })

  const parsedNotifications = useMemo(() => {
    return notifications?.notifications.map((n): ParsedNotification => {
      if (n.type === 'offering-buy') {
        try {
          const body: NotificationBody = JSON.parse(n.body)
          const listing = allListings?.find((l) => l.uuid === body.uuid)
          if (listing) {
            return { ...n, body: { listing, requestedItems: body.items, ign: body.ign } }
          }
        } catch (error) {
          console.error('Notification body could not be parsed', error)
        }
      }
      return n
    })
  }, [allListings, notifications?.notifications])

  const [tags, leagues] = useMemo(() => {
    const tags: Record<string, boolean> = {}
    const leagues: Record<string, boolean> = {}
    parsedNotifications?.forEach((n) => {
      if (typeof n.body === 'object') {
        const category = n.body.listing.meta.category
        const categoryTagItem = LISTING_CATEGORIES.find((ca) => ca.name === category)
        categoryTagItem?.tags.forEach((t) => (tags[t] = true))

        leagues[n.body.listing.meta.league] = true
      }
    })
    return [Object.keys(tags), Object.keys(leagues)]
  }, [parsedNotifications])

  const { summaries, isSummaryPending, isSummaryFetching, isSummaryError } = useQueries({
    queries: tags.map((tag) => {
      return {
        queryKey: ['summaries', tag],
        queryFn: () => listSummaries(tag),
        gcTime: 20 * 60 * 1000,
        staleTime: 20 * 60 * 1000,
        keepPreviousData: false,
        enabled: !!tag
      }
    }),
    combine: (summaryResults) => {
      const summaryShards = summaryResults.filter((x) => x.data && !x.isPending).map((x) => x.data!)

      let summaries: SageItemGroupSummaryShard['summaries'] = {}
      summaryShards.forEach((e) => {
        summaries = { ...summaries, ...e.summaries }
      })

      const isSummaryError = summaryResults.some((result) => result.isError)
      const isSummaryFetching = summaryResults.some((result) => result.isFetching)

      return {
        summaries: isSummaryError || isSummaryFetching ? undefined : summaries,
        isSummaryPending: summaryResults.some((result) => result.isPending),
        isSummaryFetching: isSummaryFetching,
        isSummaryError: isSummaryError
      }
    }
  })

  const { valuations, isValuationPending, isValuationFetching, isValuationError } = useQueries({
    queries: leagues
      .map((league) =>
        tags.map((tag) => {
          return {
            queryKey: ['valuations', league, tag],
            queryFn: () => listValuations(league, tag),
            gcTime: 20 * 60 * 1000,
            staleTime: 20 * 60 * 1000,
            keepPreviousData: false,
            enabled: !!league && !!tag
          }
        })
      )
      .flat(),
    combine: (valuationResults) => {
      const valuationShards = valuationResults
        .filter((x) => x.data && !x.isPending)
        .map((x) => x.data!)

      const valuations: Record<string, SageValuationShard['valuations']> = {}
      valuationShards.forEach((e) => {
        valuations[e.meta.league] = { ...valuations[e.meta.league], ...e.valuations }
      })

      const isValuationError = valuationResults.some((result) => result.isError)
      const isValuationFetching = valuationResults.some((result) => result.isFetching)

      return {
        valuations:
          isValuationError || isValuationFetching || leagues.length === 0 ? undefined : valuations,
        isValuationPending: valuationResults.some((result) => result.isPending),
        isValuationFetching,
        isValuationError
      }
    }
  })

  const startCalculation = valuations !== undefined && summaries !== undefined

  useEffect(() => {
    parsedNotifications?.forEach((n) => {
      if (!summaries || !valuations) return
      if (listedNotifications.current[n.id]) return
      listedNotifications.current[n.id] = true

      if (n.type !== 'offering-buy') {
        console.warn('Notification type not supported', n)
        return
      }
      if (typeof n.body !== 'object' || !n.body.requestedItems) {
        console.warn('Notification listing not found', n)
        return
      }
      console.log('Notification received: ', n)

      let validNotification = true
      const { listing: offering, requestedItems, ign } = n.body

      let listing: SageListingType | undefined
      if (requestedItems.length > 0) {
        // Single items
        const reqItems = requestedItems
          .map(([hash, selectedQuantity]): SageSelectedDatabaseOfferingItemType | undefined => {
            const item = offering?.items.find((item) => item.hash === hash)
            if (!item) {
              validNotification = false
              return undefined
            }
            return {
              ...item,
              selectedQuantity: selectedQuantity
            }
          })
          .filter((item) => !!item) as SageSelectedDatabaseOfferingItemType[]

        if (validNotification) {
          listing = calculateListingFromOfferingListing(
            { ...offering, items: reqItems },
            summaries,
            valuations[offering.meta.league]
          )
        }
      } else {
        listing = calculateListingFromOfferingListing(
          offering,
          summaries,
          valuations[offering.meta.league]
        )
      }

      if (validNotification && listing) {
        let description: ReactNode
        if (requestedItems.length === 0) {
          description = t('body.wtbAll', {
            category: t(`categories.${listing.meta.subCategory || listing.meta.category}` as any)
          })
        } else {
          const totalItems = listing.items.reduce((sum, item) => item.selectedQuantity + sum, 0)
          description = t('body.wtbPartial', {
            count: totalItems,
            category: t(`categories.${listing.meta.subCategory || listing.meta.category}` as any)
          })
        }

        const toastBody = (
          <div className="flex flex-col gap-2 text-sm">
            <div className="font-medium">
              <TooltipProvider>
                <Tooltip>
                  @
                  <span className="space-x-1">
                    <TooltipTrigger asChild>
                      <span className="underline underline-offset-2 cursor-help">{ign}</span>
                    </TooltipTrigger>
                    {description}
                  </span>
                  {/* TODO: Show user stats */}
                  {/* <TooltipContent>{`User: ${ign}`}</TooltipContent> */}
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex flex-row items-center justify-start gap-2">
              <Image
                className="block h-5 min-h-fit min-w-fit"
                src={listing.meta.icon}
                alt={listing.meta.altIcon}
                height={20}
                width={20}
                sizes="33vw"
                style={{ width: 'auto', height: '20px' }}
              />
              <div className="text-nowrap">{t('label.total')}</div>
              <CurrencyDisplay
                ttContentClassName="z-[100]"
                iconRect={{ width: 20, height: 20 }}
                value={listing.meta.calculatedTotalPrice}
                splitIcons
              />
            </div>
          </div>
        )

        const toastData: ToastData = {
          listing,
          created: n.timestamp,
          type: n.type,
          buyer: n.senderId,
          ign,
          toastBody
        }

        toast(
          <div className="flex flex-row items-center justify-between w-full gap-2">
            {toastBody}
            <Button variant="outline" size="icon">
              <Link
                href={`/trade/${n.id}`}
                target={openTradeOverviewInNewWindow ? '_blank' : undefined}
                rel="noreferrer noopener"
              >
                <PackageSearchIcon className="h-4 w-4 shrink-0" />
              </Link>
            </Button>
          </div>,
          'info',
          {
            toastId: n.id,
            data: toastData
          }
        )
      } else {
        toast(
          t('notification:warning.description.tradeRequestNotValid', { ign: n.body.ign }),
          'warning',
          {
            toastId: n.id,
            data: listing
          }
        )
        console.warn(`Be careful ${n.body.ign} wants to buy items which are not offered ...`)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCalculation, parsedNotifications])

  return null
}

export default memo(Notifier)
