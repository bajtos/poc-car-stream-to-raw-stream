/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a
 * type definition for the `Env` object can be regenerated with `npm run
 * cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { CarReader } from '@ipld/car'
import { validateBlock } from '@web3-storage/car-block-validator'
import {
  recursive as exporter,
  type UnixFSBasicEntry,
} from 'ipfs-unixfs-exporter'

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const cid = 'bafybeiagrjpf2rwth5oylc64czsrz2jm7a4fgo67b2luygqjrivjbswuku'
    const subpath = URL.parse(request.url)?.pathname

    const { signal } = request

    const originUrl = `https://frisbii.fly.dev/ipfs/${cid}${subpath}?format=car&dag-scope=entity&car-dups=y`
    console.log(`Fetching origin URL: ${originUrl}`)
    const res = await fetch(originUrl)
    if (!res.ok) return res

    if (!res.body) {
      return new Response('No body', { status: 502 })
    }

    const reader = await CarReader.fromIterable(res.body)
    const blocksReader = reader.blocks()

    const entries = exporter(
      `${cid}${subpath}`,
      {
        async get(blockCid) {
          const res = await blocksReader.next()
          if (res.done || !res.value) {
            throw new Error(`Block ${blockCid} not found in CAR ${cid}`)
          }
          const block = res.value

          try {
            await validateBlock(block)
          } catch (err) {
            throw new Error(`Invalid block ${blockCid} of root ${cid}`, {
              cause: err,
            })
          }
          return block.bytes
        },
      },
      { signal, blockReadConcurrency: 1 },
    )

    for await (const entry of entries) {
      signal?.throwIfAborted()
      console.log(`Entry: ${entry.path} (${entry.type})`)

      const expectedPath = subpath === '/' ? cid : `${cid}${subpath}`
      if (entry.path !== expectedPath) {
        throw new Error(
          `Unexpected entry - wrong path: ${describeEntry(entry)}`,
        )
      }

      if (entry.type !== 'file') {
        console.log(`Unexpected entry - wrong type: ${describeEntry(entry)}`)
        return new Response('Not Found', { status: 404 })
      }

      const entryContent = entry.content()

      // Convert AsyncGenerator to ReadableStream for Response body
      const rawDataStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of entryContent) {
              signal?.throwIfAborted()
              controller.enqueue(chunk)
            }
            controller.close()
          } catch (error) {
            controller.error(error)
          }
        },
      })

      return new Response(rawDataStream)
    }

    return new Response('Not Found', { status: 404 })
  },
} satisfies ExportedHandler<Env>

export function describeEntry(entry: UnixFSBasicEntry) {
  return JSON.stringify(
    entry,
    (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  )
}
