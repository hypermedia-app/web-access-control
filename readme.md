# web-access-control

Querying [Web Access Control](https://www.w3.org/wiki/WebAccessControl) entries over a SPARQL endpoint to authorize access to resources.

### What it does?

Given the accessed resource and an agent, it executes queries to see if that agent should be granted access to said resource.  

Currently, the library makes some assumptions about the store structure:

1. Protected resources and ACLs have to be in the same store
2. The default graph is queried. Consult your store so that the [union graph](https://patterns.dataincubator.org/book/union-graph.html) is used as the active dataset

See below for more details. 

### Examples

Check the [examples](./examples/acls.ru) file for various instances of `acl:Autorization` resources. 

## hydra-box-web-access-control

Protects [Hydra APIs](http://www.hydra-cg.com/spec/latest/core/) running [hydra-box](https://npm.im/hydra-box).

Instances of `hydra:Operation` can be annotated with a `acl:mode` property to force this access mode being checked:

```turtle
@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix hydra: <http://www.w3.org/ns/hydra/core#> .

[
  a hydra:Operation ;
  hydra:method "POST" ;
  acl:mode acl:Write ;
] .
``` 

If not explicitly stated, the HTTP method will be mapped:

| method | access mode |
| -- | -- |
| `GET` | `acl:Read` |
| `HEAD` | `acl:Read` |
| `OPTIONS` | `acl:Read` |
| `POST` | `acl:Write` |
| `PUT` | `acl:Write` |
| `PATCH` | `acl:Write` |
| `DELETE` | `acl:Write` |

### Setup

The setup requires creating an express middleware by providing a SPARQL client instance ([sparql-http-client](https://npm.im/sparql-http-client)), and a function to get the current user's (agent's) Graph Pointer.

```typescript
import express from 'express'
import clownface from 'clownface'
import $rdf from 'rdf-ext'
import { rdf, acl } from '@tpluscode/rdf-ns-builders'
import SparqlClient from 'sparql-http-client'
import * as hydraBox from 'hydra-box'
import accessControl from 'hydra-box-web-access-control' 
 
const app = express()

const client = new SparqlClient({
  endpoint: 'http://query.example.com/sparql'
})

// assume that there is an earlier middleware
// which creates the agent resource
app.use((req, res, next) => {
  // in this example it creates a user by hand, 
  // from info provided by express-basic-auth.
  // typically, would load from a store
  req.agent = clownface({ dataset: $rdf.dataset() })
    .namedNode(`urn:user:${req.auth.user}`)
    .addOut(rdf.type, acl.AuthenticatedAgent)
  
  next()
})

// the middleware will access req.agent to get its URI and RDF types
// it needs to be configured a hydra-box resource middleware
app.use(hydraBox.middleware(api, {
  middleware: {
    resource: [
      accessControl({ client })
    ]
  }
}))
```


## rdf-web-access-control

The underlying library used by `hydra-box-web-access-control` middleware.

### Check user access to resource

```typescript
import { check } from 'rdf-web-access-control'

const hasAccess: boolean = await check({
  accessMode, // subclass of acl:Access, such as acl:Read or acl:Write
  agent,      // agent Graph Pointer
  term,       // resource URI
  client,     // sparql-http-client
})
```

For the given agent `<A>` and (optionally) resource `<R>`, it will prepare and execute a SPARQL query, looking for any instances of `acl:Authorization` which satisfy one of possible combinations:

1. Direct access grant
   - `[ acl:agent <A> ; acl:accessTo <R> ]`
2. Direct grant for class of agents
   - `[ acl:agent ?typeofAgentA ; acl:accessTo <R> ]`
3. Access granted to class of resources
   - `[ acl:agent <A> ; acl:accessTo ?typeofResourceR ]`
4. Access granted to class of resources for class of agents
   - `[ acl:agent ?typeofAgentA ; acl:accessTo ?typeofResourceR ]`
5. Agent owns resource
   - `<R> ac:owner <A>`
   
### Check user access to type of resource

Alternatively, if no specific resource is given, it is possible provide the RDF types instead of an identifier. Such would be the case when creating new resources.

```typescript
import { check } from 'rdf-web-access-control'

const hasAccess: boolean = await check({
  accessMode, // subclass of acl:Access, such as acl:Read or acl:Write
  agent,      // agent Graph Pointer
  types,      // array of RDF types
  client,     // sparql-http-client
})
```

This will only query for `acl:Authorization` using `acl:accessToClass`.

### Controling access

All queries will include add `acl:Control` mode so that it grants automatic access to the otherwise specified resource/agent combinations.

All queries will include checks for `foaf:Agent` and `acl:AuthenticatedUser` to allow creating ACL entries for anonymous users and any authenticated users respectively.

All queries will implicitly add `rdfs:Resource` to the queries types. Given a store with inferencing capabilities and the use of `rdfs:subClassOf rdfs:Resource`, it would be possible to have an ACL entry such, that it grants access to "any resource".

```turtle
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix acl: <http://www.w3.org/ns/auth/acl#> .

# Any authenticated user has read access to any resource
<>
  a acl:Authorization ;
  acl:mode acl:Read ;
  acl:agentClass acl:AuthenticatedAgent ;
  acl:accessToClass rdfs:Resource ;
.
```
