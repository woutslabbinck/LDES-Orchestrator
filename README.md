# LDES-Orchestrator
Fills the gaps that a Linked Data Platform (LDP) cannot do by itself for creating a Linked Data Event Stream (LDES) in LDP. It creates extra relations and corresponding metadata when needed to improve the scalability of a growing LDES in LDP.

## Set up
Create  an environment file in the root directory of where you cloned the repository  (`.env`) has to be made with as content the identity provider used for your WebID. (e.g. SOLID_IDP=https://broker.pod.inrupt.com )

For orchestrating your LDES in Solid, this webID should have acl:Control rights ([WAC](https://solidproject.org/TR/wac)) to the ldp:Container of the LDES in Solid.

```txt
SOLID_IDP=https://broker.pod.inrupt.com
```

## Session

Credentials can be obtained by executing the `login()` function in your code. When a login was successful, those credentials will be printed out to system out like the following:

```bash
These are your login credentials:
{
  "refreshToken" : <token>,
  "clientId"     : <id>,
  "clientSecret" : <secret>,
  "issuer"       : "https://broker.pod.inrupt.com/",
}
```

Those credentials will be used to get a Session. When logged in, the function `getSession()` can be used to get a Session using those credentials.

```javascript
const { login, isLoggedin, getSession } = require("@treecg/ldes-orchestrator")

login();
await isLoggedin(); // code that checks whether you are already logged in
const session = await getSession();
```

Warning: when you use the credentials once, you will have to log in again to get new credentials.

more information see about the Session class can be found here: https://docs.inrupt.com/developer-tools/javascript/client-libraries/tutorial/authenticate-nodejs/

## Using LDESinSolid

### Existing LDES in LDP

Here the LDES in LDP already exists on a given url (which is the variable `base` in the code)

Requirements

* have the `base` IRI of an LDES in LDP (e.g. https://tree.linkeddatafragments.org/announcements)
* have acl:Control rights in the base (more information about ACL: https://solid.github.io/web-access-control-spec/)
* have a session (see [Session](#session))

```javascript
const { LDESinSolid,login, isLoggedin, getSession } = require('@treecg/ldes-orchestrator');

// log in and get session
login();
await isLoggedin(); 
const session = await getSession();

const base = ... ;
const config = LDESinSolid.getConfig(base);
const ldes = new LDESinSolid(config.LDES, config.ACL, session);

// now you can do stuff with the ldes
// get amount of resources of the current container to which can be written
console.log(await ldes.getAmountResources());

// create a new container to which MUST be written
await ldes.createNextContainer();
```



### Creating a new LDES in LDP instance

Requirements

* have a solid pod where you have `acl:Control` rights to when logged in with a `session`
* create a `base` IRI in that solid pod

e.g. https://solid.pod.com/ is the pod where you have acl:Control, then the `base` can be https://solid.pod.com/base/
```javascript
const { LDESinSolid,login, isLoggedin, getSession } = require('@treecg/ldes-orchestrator');

// log in and get session
login();
await isLoggedin(); 
const session = await getSession();

const ldesConfig = {
    base : ... ,
    treePath: ... , // valid shacl path
    shape: ... , // IRI of the shape (to which all the members of the EventStream must conform to) (note: currently only SHACL shapes)
    relationType: ... , // default: https://w3id.org/tree#GreaterThanOrEqualToRelation
}
const aclConfig = {
    agent: ... // this is the webId used in the session
}

const ldes = new LDESinSolid(ldesConfig, aclConfig, session);
await ldes.createLDESinLDP();
```

after executing this code, you can go to base to see that an LDES is created (especially see the root at <base>root.ttl)

It is also possible to create an LDESinSolid which is only visible to you.

```typescript
const { AccessSubject} = require('@treecg/ldes-orchestrator')
await ldes.createLDESinLDP(AccessSubject.Agent);
```



## The orchestrator

Requirements

* have a `base` IRI of an LDES in LDP where you have `acl:Control` rights when logged in with a `session`

```javascript
const { Orchestrator,login, isLoggedin, getSession } = require('@treecg/ldes-orchestrator');

// log in and get session
login();
await isLoggedin(); 
const session = await getSession();

const base = ... ;


// the second parameter is the interval (s), thus each 5 minutes the orchestrator runs and when needed creates a new container
const config = LDESinSolid.getConfig(base);
const ldes = new LDESinSolid(config.LDES, config.ACL, session);
const orchestrator = new Orchestrator(session);
orchestrator.orchestrateLDES(base, 300);

```

### UML sequence diagram creating new container for LDES

![img](img/Sequence_diagram_orchestrate.png)
