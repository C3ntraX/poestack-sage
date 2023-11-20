import { SmartCache } from './smart-cache'
import { HttpUtil } from 'sage-common'
import { EchoDirService } from './echo-dir-service'

export class SageValuationService {
  private httpUtil = new HttpUtil()

  constructor(private echoDir: EchoDirService) { }

  public cacheValuationShards = new SmartCache<SageValuationShard>(this.echoDir, "sage-valuations", (key) =>
    this.loadInternal(key)
  )

  public load(tag: string, shard: number | string, league: string) {
    this.cacheValuationShards
      .load({ key: `${tag}_${shard}_${league}`.replaceAll(' ', '_') })
      .subscribe()
  }

  private loadInternal(key: string) {
    return this.httpUtil.get<SageValuationShard>(
      `https://d2irw5qsw9zuri.cloudfront.net/v3/${key}.json`
    )
  }
}

export type SageValuation = {
  l: number
  pvs: number[]
}

export type SageValuationShard = {
  timestampMs: number
  valuations: { [hash: string]: SageValuation }
}
