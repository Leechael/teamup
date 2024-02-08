import { Hono } from 'hono'
import { showRoutes } from 'hono/dev'
import { timing, setMetric, startTime, endTime } from 'hono/timing'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import { type Frame, getFrameFlattened } from 'frames.js'
import * as R from 'ramda'

const app = new Hono()

app.use('*', logger())
app.use('*', timing())
app.use('/public/*', serveStatic({
  root: './',
  onNotFound: (path, c) => {
    console.log(`${path} is not found, you access ${c.req.path}`)
  }
}))

app.get('/campaigns/:chain/:contract/:teamId', async (c) => {
  const host = c.req.header('host')
  const proto = c.req.header('x-forwarded-proto') || 'http'
  const frame: Frame = {
    image: `${proto}://${host}/public/cover/${c.req.param('contract')}.jpg`,
    version: 'vNext',
    buttons: [
      {
        label: 'Join',
        action: 'post',
      },
    ],
    postUrl: `${proto}://${host}/frames/${c.req.param('chain')}/${c.req.param('contract')}/${c.req.param('teamId')}`,
  }
  const meta = R.filter((i) => !!(i?.[1]), R.toPairs(getFrameFlattened(frame))) as [string, string][]
  return c.html(
    <html>
      <head>
        {meta.map(([key, value]) => <meta name={key} content={value} />)}
      </head>
      <body>
        You contract {c.req.param('contract')} on chain {c.req.param('chain')}
      </body>
    </html>
  )
})

app.post('/frames/:chain/:contract/:teamId', async (c) => {
  const json = await c.req.json()
  console.log(json)
  const host = c.req.header('host')
  const proto = c.req.header('x-forwarded-proto') || 'http'
  const frame: Frame = {
    image: `${proto}://${host}/public/cover/${c.req.param('contract')}.jpg`,
    version: 'vNext',
    buttons: [
      {
        label: 'Join',
        action: 'post',
      },
    ],
    postUrl: `${proto}://${host}/frames/${c.req.param('chain')}/${c.req.param('contract')}/${c.req.param('teamId')}`,
  }
  const meta = R.filter((i) => !!(i?.[1]), R.toPairs(getFrameFlattened(frame))) as [string, string][]
  return c.html(
    <html>
      <head>
        {meta.map(([key, value]) => <meta name={key} content={value} />)}
      </head>
      <body>
        You contract {c.req.param('contract')} on chain {c.req.param('chain')}
      </body>
    </html>
  )
})

showRoutes(app, {
  verbose: true,
  colorize: true,
})

export default { 
  port: 3001, 
  fetch: app.fetch, 
}
