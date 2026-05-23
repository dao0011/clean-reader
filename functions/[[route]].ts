// @ts-ignore — Pages Function ctx is compatible at runtime with Hono's fetch
import app from '../src/index'
export const onRequest = (ctx: any) => app.fetch(ctx.request, ctx.env, ctx)
