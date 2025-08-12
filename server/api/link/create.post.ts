import { LinkSchema, nanoid } from '@/schemas/link'

export default eventHandler(async event => {
  const body = await readBody(event)
  const link = LinkSchema.parse(body)

  const { cloudflare } = event.context
  const { KV } = cloudflare.env
  const { reserveSlug } = useAppConfig(event)

  // 检查用户是否提供了自定义slug
  const userProvidedSlug = !!body.slug

  // 如果用户提供了slug，直接检查是否可用
  if (userProvidedSlug) {
    // 检查是否为保留slug
    if (reserveSlug.includes(link.slug!)) {
      throw createError({
        status: 400,
        statusText: 'Slug is reserved',
      })
    }

    const existingLink = await KV.get(`link:${link.slug}`)
    if (existingLink) {
      throw createError({
        status: 409, // Conflict
        statusText: 'Link already exists',
      })
    }
  } else {
    // 用户没有提供slug，自动生成一个可用的slug
    let attempts = 0
    const maxAttempts = 10

    do {
      link.slug = nanoid()
      attempts++

      // 检查是否为保留slug
      if (reserveSlug.includes(link.slug)) {
        continue
      }

      const existingLink = await KV.get(`link:${link.slug}`)
      if (!existingLink) {
        break // 找到可用的slug
      }

      if (attempts >= maxAttempts) {
        throw createError({
          status: 500,
          statusText: 'Unable to generate unique slug',
        })
      }
    } while (true)
  }

  const expiration = getExpiration(event, link.expiration)

  await KV.put(`link:${link.slug}`, JSON.stringify(link), {
    expiration,
    metadata: {
      expiration,
    },
  })

  setResponseStatus(event, 201)
  const shortLink = `${getRequestProtocol(event)}://${getRequestHost(event)}/${link.slug}`
  return { link, shortLink }
})
