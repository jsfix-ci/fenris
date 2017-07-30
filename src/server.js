import path from 'path'
import express from 'express'
import webpack from 'webpack'
import dev from 'webpack-dev-middleware'
import hot from 'webpack-hot-middleware'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import uuid from 'uuid/v4'
import renderMiddleware from './lib/renderMiddleware'
import csrfMiddleware from './lib/csrfMiddleware'

global.ENVIRONMENT = process.env.NODE_ENV || 'default'
process.on('unhandledRejection', (reason, p) => {
  if (reason.stack) console.error(reason.stack)
  else console.error('Unhandled Rejection at: Promise ', p, ' reason: ', reason)
})

const server = express()

server.set('trust proxy', 'loopback')
server.use(compression())
server.use(bodyParser.json())
server.use(cookieParser())
server.use(csrfMiddleware)
export const attachMiddleware = (middleware) => {
  server.use(middleware)
}

const defaultMiddleware = (req, res, next) => next()
const normalizedPromises = (routePromise, handleSuccess) => (req, res) => {
  routePromise({
    ...req.params,
    ...req.body,
    ...req.query,
    ...res.locals,
    cookies: req.cookies
  }).then(
    handleSuccess(res),
    (error) => res.status(500).json(error)
  )
}
const sendJSON = (res) => (data) => 
  res.status(200).json(data)
const sendHTML = (res) => (data) =>
  res.status(200).send(data)
const sendDownload = (res) => ({url, fileName, done}) => 
  res.status(200).download(url, fileName || url, done)
const sendRedirect = (res) => ({url}) => 
  res.redirect(url)

const createEndpoint = (method, successHandler = sendJSON) => (endpoint, promise, middleware = defaultMiddleware) => {
  server[method](
    endpoint, 
    middleware, 
    normalizedPromises(
      promise, 
      successHandler
    )
  )
}

export const getEndpoint = createEndpoint('get')
export const postEndpoint = createEndpoint('post')
export const htmlEndpoint = createEndpoint('get', sendHTML)
export const downloadEndpoint = createEndpoint('get', sendDownload)
export const redirectEndpoint = createEndpoint('get', sendRedirect)

// options: {
//   AppComponent,
//   port,
//   config, 
//   baseCss, 
//   cssToString,
//   cachePerUrl
// }
export default ({AppComponent, port, config, ...options}) => {
  port = port || process.env.PORT || 3000

  if (process.env.NODE_ENV !== 'production') {
    if (!config) throw new Error('Dev config not supplied for development server')
    const compiler = webpack({
      ...config,
      output: {
        ...config.output,
        path: path.resolve(__dirname, `../../${config.output.path}`)
      }
    })

    server.use(dev(compiler, {
      publicPath: config.output.publicPath,
      stats: {
        colors: true,
        hash: false,
        timings: true,
        chunks: false,
        chunkModules: false,
        modules: false,
      },
    }))
    server.use(hot(compiler))
  }

  server.use(express.static(config.output.path))

  server.get('*', renderMiddleware({AppComponent, bundle: config.output.filename, ...options}))

  server.listen(port, (err) => {
    if (err) {
      console.error(err)
      return
    }
    console.info(`⚡⚡⚡ Server running on http://localhost:${port}/`)
  })
}