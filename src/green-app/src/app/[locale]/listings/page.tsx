'use client'

import { ListingCategorySelect } from '@/components/listing-category-select'
import ListingFilterCard from '@/components/trade-filter-card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import { useDivinePrice } from '@/hooks/useDivinePrice'
import { SageListingType } from '@/types/sage-listing-type'
import { FilterFn, filterFns } from '@tanstack/react-table'
import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import ListingsHandler from './listings-handler'
import ListingsTable from './listings-table'
import { listingsTableColumns } from './listings-table-columns'
import { useListingsStore } from './listingsStore'
import { useTranslation } from 'react-i18next'

export default function ListingsPage() {
  const { t } = useTranslation()
  const selectedLeague = useListingsStore((state) => state.league)
  const [selectedCategory, setSelectedCategory] = useListingsStore(
    useShallow((state) => [state.category, state.setCategory])
  )
  const [selectedSubCategory, setSelectedSubCategory] = useListingsStore(
    useShallow((state) => [state.subCategory, state.setSubCategory])
  )
  const [filterGroups, setFilterGroups] = useListingsStore(
    useShallow((state) => [state.filterGroups, state.setFilterGroups])
  )

  useDivinePrice(selectedLeague)

  const columns = useMemo(() => {
    return listingsTableColumns()
  }, [])

  const fuzzyFilter: FilterFn<SageListingType> = useCallback(
    (row, columnId, filterValue, addMeta) => {
      return filterFns.includesString(row, columnId, filterValue, addMeta)
    },
    []
  )

  return (
    <>
      <ListingsHandler />
      <div className="flex flex-row">
        <div className="flex flex-1" />
        <div className="flex flex-col w-[1024px] gap-4">
          <div className="flex flex-row gap-4">
            <div className="flex flex-row basis-1/2 gap-4">
              <div className="flex w-full max-w-48">
                <ListingCategorySelect
                  control="combobox"
                  isSubCategory={false}
                  category={selectedCategory}
                  subCategory={selectedSubCategory}
                  onCategorySelect={setSelectedCategory}
                  onSubCategorySelect={setSelectedSubCategory}
                />
              </div>
              <div className="flex w-full max-w-48">
                <ListingCategorySelect
                  control="combobox"
                  isSubCategory
                  category={selectedCategory}
                  subCategory={selectedSubCategory}
                  onCategorySelect={setSelectedCategory}
                  onSubCategorySelect={setSelectedSubCategory}
                />
              </div>
            </div>
            <Accordion type="single" collapsible className="flex basis-1/2 w-full">
              <AccordionItem className="w-full" value="item-1">
                <AccordionTrigger>{t('title.itemFilter')}</AccordionTrigger>
                <AccordionContent>
                  <ListingFilterCard
                    className=""
                    category={selectedCategory}
                    subCategory={selectedSubCategory}
                    filterGroups={filterGroups}
                    onFilterGroupsChange={setFilterGroups}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          <ListingsTable
            className="col-span-4"
            columns={columns as any}
            globalFilterFn={fuzzyFilter as any}
          />
        </div>
        <div className="flex flex-1" />
      </div>
    </>
  )
}
