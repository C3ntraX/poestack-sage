'use client'

import { listListings, listSummaries, listValuations } from '@/lib/http-util'
import { LISTING_CATEGORIES } from '@/lib/listing-categories'
import { calculateListingFromOfferingListing } from '@/lib/listing-util'
import { SageItemGroupSummaryShard } from '@/types/echo-api/item-group'
import { SageValuationShard } from '@/types/echo-api/valuation'
import { SageListingType } from '@/types/sage-listing-type'
import { useQueries, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { memo, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useListingsStore } from './listingsStore'

interface ListingsHandlerProps {}

// Tutorial: https://ui.shadcn.com/docs/components/data-table
const ListingsHandler = () => {
  const league = useListingsStore((state) => state.league)
  const categoryItem = useListingsStore(
    useShallow((state) => LISTING_CATEGORIES.find((ca) => ca.name === state.category))
  )
  // Starts with 0
  const fetchTimeStamp = useListingsStore(
    (state) => state.fetchTimeStamps[state.league]?.[state.category || '']
  )
  const setFetchTimestamp = useListingsStore((state) => state.setFetchTimestamps)
  const addListings = useListingsStore((state) => state.addListings)
  const cleanupListings = useListingsStore((state) => state.cleanupListings)

  const { data: listings } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: ['listings', league, categoryItem?.name || ''],
    queryFn: async () => {
      const listings = await listListings(league, categoryItem!.name, fetchTimeStamp)
      const nextMs = dayjs.utc().valueOf()
      setFetchTimestamp(nextMs - 2000)
      return listings
    },
    // We do not save any cache - this has the effect, that the query starts directly after changing the category
    gcTime: 0,
    enabled: !!categoryItem,
    refetchInterval: 2000,
    retry: true
  })

  const { summaries, isSummaryPending, isSummaryFetching, isSummaryError } = useQueries({
    queries: categoryItem
      ? categoryItem.tags.map((tag) => {
          return {
            queryKey: ['summaries', tag],
            queryFn: () => listSummaries(tag),
            gcTime: 20 * 60 * 1000,
            staleTime: 20 * 60 * 1000,
            keepPreviousData: false,
            enabled: !!tag
          }
        })
      : [],
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

  // This is only one league
  const leagues = useMemo(() => {
    const distinctLeagues: Record<string, boolean> = {}
    listings?.forEach((l) => (distinctLeagues[l.meta.league] = true))
    return Object.keys(distinctLeagues)
  }, [listings])

  const { valuations, isValuationPending, isValuationFetching, isValuationError } = useQueries({
    queries:
      leagues.length > 0 && categoryItem
        ? leagues
            .map((league) =>
              categoryItem.tags.map((tag) => {
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
            .flat()
        : [],
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

  const startCalculation = !!categoryItem && valuations !== undefined && summaries !== undefined

  useEffect(() => {
    if (listings && listings.length > 0 && startCalculation) {
      const nextListings = listings.map((listing) =>
        calculateListingFromOfferingListing(listing, summaries, valuations[listing.meta.league])
      )

      // One user can have one category per league active. We delete or replace this
      const categories: Record<string, SageListingType[]> = {}
      nextListings.forEach((l) => {
        const categoryKey = l.meta.category + (!l.meta.subCategory ? '' : `_${l.meta.subCategory}`)
        if (categories[categoryKey]) {
          categories[categoryKey].push(l)
        } else {
          categories[categoryKey] = [l]
        }
      })
      Object.entries(categories).forEach(([categoryKey, listings]) => {
        const [category, subCategory] = categoryKey.split('_')
        addListings(listings, category, subCategory)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCalculation, listings])

  useEffect(() => {
    const interval = setInterval(cleanupListings, 2000)
    return () => clearInterval(interval)
  }, [cleanupListings])

  return null
}

export default memo(ListingsHandler)
