/// <reference types="@kopflos-cms/core/middleware.js" />

import asyncMiddleware from 'middleware-async'
import error from 'http-errors'
import type StreamClient from 'sparql-http-client/StreamClient.js'
import type * as express from 'express'
import { acl } from '@tpluscode/rdf-ns-builders'
import { check, AdditionalPatterns, Check } from 'rdf-web-access-control'
import { Variable } from '@rdfjs/types'
import type { SparqlTemplateResult } from '@tpluscode/sparql-builder'

export interface AclPatterns {
  (acl:Variable, req: express.Request): SparqlTemplateResult | string
}

interface Option {
  client: StreamClient
  additionalPatterns?: AclPatterns | AclPatterns[]
  additionalChecks?: Check['additionalChecks']
}

function wrapPatterns(patterns: Option['additionalPatterns'] = [], req: express.Request): AdditionalPatterns[] {
  const arr = Array.isArray(patterns) ? patterns : [patterns]
  return arr.map(func => acl => func(acl, req))
}

export default ({ client, additionalPatterns, additionalChecks }: Option): express.RequestHandler => asyncMiddleware(async (req, res, next) => {
  if (!req.hydra.resource) {
    return next()
  }

  let accessMode = req.hydra.operation?.out(acl.mode).term

  if (!accessMode) {
    switch (req.method.toUpperCase()) {
      case 'GET':
      case 'HEAD':
      case 'OPTIONS':
        accessMode = acl.Read
        break
      case 'POST':
      case 'PUT':
      case 'PATCH':
      case 'DELETE':
        accessMode = acl.Write
        break
    }
  }

  if (accessMode?.termType !== 'NamedNode') {
    return next(new error.InternalServerError('Could not determine ACL mode for operation'))
  }

  const result = await check({
    term: [req.hydra.term, req.hydra.resource.term],
    accessMode,
    client,
    agent: req.agent,
    additionalPatterns: wrapPatterns(additionalPatterns, req),
    additionalChecks,
  })

  if (!result) {
    return next(req.agent ? new error.Forbidden() : new error.Unauthorized())
  }

  return next()
})
