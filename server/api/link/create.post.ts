import { LinkSchema, nanoid } from '@/schemas/link'

export default eventHandler(async event => {
  const body = await readBody(event)

  // 检查用户是否提供了自定义slug
  const userProvidedSlug = !!body.slug

  // 如果用户没有提供slug，先生成一个
  if (!userProvidedSlug) {
    body.slug = nanoid()
  }

  const link = LinkSchema.parse(body)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env
  const { reserveSlug } = useAppConfig(event)

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
    // 用户没有提供slug，需要确保生成的slug可用
    let attempts = 0
    const maxAttempts = 50

    while (attempts < maxAttempts) {
      // 检查是否为保留slug
      if (reserveSlug.includes(link.slug!)) {
        link.slug = nanoid()
        attempts++
        continue
      }

      // 检查是否已存在
      const existingLink = await KV.get(`link:${link.slug}`)
      if (!existingLink) {
        break // 找到可用的slug
      }

      // 重新生成slug
      link.slug = nanoid()
      attempts++
    }

    // 如果达到最大重试次数仍未找到可用slug
    if (attempts >= maxAttempts) {
      throw createError({
        status: 500,
        statusText: 'Unable to generate unique slug after multiple attempts',
      })
    }
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
