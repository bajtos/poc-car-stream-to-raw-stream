declare module '@web3-storage/car-block-validator' {
  import type { CID } from 'multiformats/cid'
  import type { MultihashHasher } from 'multiformats/hashes/interface'

  export interface Block {
    cid: CID
    bytes: Uint8Array
  }

  export function validateBlock(block: Block): Promise<void> | undefined

  export const hashMap: Map<number, MultihashHasher>

  export class UnsupportedHashError extends Error {
    constructor(code: number)
  }

  export class HashMismatchError extends Error {
    constructor()
  }
}
