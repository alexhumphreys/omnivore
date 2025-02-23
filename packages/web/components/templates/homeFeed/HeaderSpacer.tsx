import { usePersistedState } from '../../../lib/hooks/usePersistedState'
import { PinnedSearch } from '../../../pages/settings/pinned-searches'
import { Box } from '../../elements/LayoutPrimitives'

export const DEFAULT_HEADER_HEIGHT = '85px'

// export const useGetHeaderHeight = () => {
//   const [hidePinnedSearches] = usePersistedState({
//     key: '--library-hide-pinned-searches',
//     initialValue: false,
//     isSessionStorage: false,
//   })
//   const [pinnedSearches] = usePersistedState<PinnedSearch[] | null>({
//     key: `--library-pinned-searches`,
//     initialValue: [],
//     isSessionStorage: false,
//   })

//   if (hidePinnedSearches || !pinnedSearches?.length) {
//     return '90px'
//   }
//   return '90px'
// }

export function HeaderSpacer(): JSX.Element {
  // const headerHeight = useGetHeaderHeight()
  return (
    <Box
      css={{
        height: DEFAULT_HEADER_HEIGHT,
        bg: '$grayBase',
        '@mdDown': {
          height: DEFAULT_HEADER_HEIGHT,
        },
      }}
    ></Box>
  )
}
