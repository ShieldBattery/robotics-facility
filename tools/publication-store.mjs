import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { PREFIX, httpsUrl } from './publication.mjs'

export function objectKey(relative) {
  if (
    !/^(catalog\.json|catalogs\/[1-9][0-9]*\.json|published\/[1-9][0-9]*\.json|packages\/[a-f0-9]{64}\.zip|releases\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\.json)$/.test(
      relative,
    )
  ) {
    throw new Error('Object outside permitted publication layout')
  }
  return PREFIX + relative
}

export function createStore({ endpoint, bucket, region, accessKeyId, secretAccessKey }) {
  const url = httpsUrl(endpoint)
  if (
    url.pathname !== '/' ||
    url.search ||
    !bucket ||
    !region ||
    !accessKeyId ||
    !secretAccessKey
  ) {
    throw new Error('Incomplete or invalid Spaces configuration')
  }
  const client = new S3Client({
    endpoint: url.href,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 3,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return {
    async get(relative, limit) {
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: objectKey(relative) }),
          { abortSignal: AbortSignal.timeout(180000) },
        )
        if (result.ContentLength > limit) {
          result.Body?.destroy()
          throw new Error('Stored object exceeds expected size')
        }
        const chunks = []
        let total = 0
        for await (const chunk of result.Body) {
          total += chunk.length
          if (total > limit) throw new Error('Stored object exceeds expected size')
          chunks.push(Buffer.from(chunk))
        }
        return Buffer.concat(chunks)
      } catch (error) {
        if (error.name === 'NoSuchKey') return null
        throw error
      }
    },
    async put(relative, bytes, { contentType, cacheControl }) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey(relative),
          Body: bytes,
          ContentLength: bytes.length,
          ContentType: contentType,
          CacheControl: cacheControl,
          ACL: 'public-read',
        }),
        { abortSignal: AbortSignal.timeout(180000) },
      )
    },
    close() {
      client.destroy()
    },
  }
}
