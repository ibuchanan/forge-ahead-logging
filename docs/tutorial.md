# Tutorial: Add structured logging to a Forge resolver

This tutorial takes you through a small, working logging integration in a Forge backend function. By the end, you will have a resolver that records an invocation, keeps a request identifier in ambient context, summarizes a result safely, and can be inspected with Forge logs.

## What you will build

You will add a `getStatus` resolver that:
- creates a Forge logger;
- adds an invocation-scoped `requestId`;
- logs the start and completion of the operation;
- avoids writing a full payload to the log;
- uses `LOG_LEVEL` to control verbosity.

This lesson uses the package API and assumes a Forge app already has a backend function declared in `manifest.yml`.

## 1. Install the package

From the Forge app directory, install the package from the registry available to your project:

```sh
npm install @forge-ahead/logging
```

The package is designed for backend code. Keep frontend diagnostics in the browser console; Forge’s backend logging tools collect output from backend functions.

## 2. Create the resolver

Create or open a backend source file such as `src/resolvers/status.ts`:

```ts
import Resolver from "@forge/resolver";
import {
  createForgeLogger,
  summarizeForLog,
  withForgeInvocationLogging,
  withLogContext,
} from "@forge-ahead/logging";

interface StatusRequest {
  payload: { requestId: string };
}

interface StatusResponse {
  ok: true;
  service: string;
}

const logger = createForgeLogger({
  name: "status-resolver",
});

const resolver = new Resolver();

resolver.define(
  "getStatus",
  async (request: StatusRequest): Promise<StatusResponse> =>
    withLogContext({ requestId: request.payload.requestId }, () =>
      withForgeInvocationLogging(
        logger,
        { event: "getStatus" },
        async () => {
          const result: StatusResponse = {
            ok: true,
            service: "example-forge-app",
          };

          logger.info({ result: summarizeForLog(result) }, "status result");
          return result;
        },
        { logEntry: true },
      ),
    ),
);

export const handler = resolver.getDefinitions();
```

The request and response interfaces are intentionally explicit. In a real application, make the payload type match the object sent by the frontend or event source.

## 3. Link the resolver in the manifest

The function module must point at the exported handler, and the UI module must point at the function key:

```yaml
modules:
  function:
    - key: status-resolver
      handler: src/resolvers/status.handler

  jira:globalPage:
    - key: status-page
      title: Status
      resource: status-resource
      resolver:
        function: status-resolver

resources:
  - key: status-resource
    path: src/frontend/index.tsx
```

Use the module type that matches your app. The important part for this lesson is the connection between the module, the function key, and the exported handler.

## 4. Set the log level

Set a non-secret Forge environment variable in the environment you use for development:

```sh
forge variables set LOG_LEVEL info
```

The package resolves the effective level from `LOG_LEVEL`, then `NODE_ENV`, then its default. After changing a Forge environment variable, redeploy the app before testing so the new value is available to the deployed function.

## 5. Validate and deploy

Run the package checks and Forge validation from the app root:

```sh
npm test
forge lint
forge deploy --non-interactive -e development
```

Install or upgrade the development environment if needed:

```sh
forge install --non-interactive \
  --site https://your-site.atlassian.net \
  --product jira \
  --environment development
```

## 6. Invoke the resolver

Open the app page and invoke `getStatus` from the frontend. For Custom UI, the call has this shape:

```ts
import { invoke } from "@forge/bridge";

const status = await invoke<StatusResponse>("getStatus", {
  requestId: crypto.randomUUID(),
});
```

You should see structured records containing the invocation event, the request context, and the result summary. The result is logged through the package’s bounded logging helpers rather than as an unrestricted object dump.

## 7. Inspect the records

Fetch recent development logs:

```sh
forge logs -e development --limit 20
```

Use verbose or grouped output while investigating a particular invocation:

```sh
forge logs -e development --verbose --grouped
```

You’ll notice that Forge supplies platform metadata such as an invocation identifier, while the package adds application-level fields such as `requestId`, event names, bounded summaries, and log levels.

## What you learned

You now have a minimal pattern for logging a Forge backend operation:
1. define typed resolver input and output;
2. establish context at the invocation boundary;
3. wrap the operation with invocation logging;
4. summarize values before logging them;
5. configure verbosity through a Forge environment variable;
6. inspect backend records with the Forge CLI.

Next, use the how-to guides for focused production tasks and the reference page when you need exact API behavior.

## Further reading

- [How-to guides](how-to.md)
- [Reference](reference.md)
- [Explanation](explanation.md)
- [Forge debugging and logging](https://developer.atlassian.com/platform/forge/debugging)
