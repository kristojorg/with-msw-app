import {
  handleRequest,
  MockedRequest,
  RequestHandler,
  SetupApi,
  SharedOptions,
} from "msw";
import { invariant } from "outvariant";
import { ServerLifecycleEventsMap } from "msw/lib/node";
import { handlers } from "./handlers";
import { FetchInterceptor } from "@mswjs/interceptors/lib/interceptors/fetch";
import {
  MockedResponse as MockedInterceptedResponse,
  BatchInterceptor,
  Interceptor,
  HttpRequestEventMap,
  InterceptorReadyState,
} from "@mswjs/interceptors";

// This needs an exported
type Fn = (...arg: any[]) => any;
type RequiredDeep<
  Type,
  U extends Record<string, unknown> | Fn | undefined = undefined
> = Type extends Fn
  ? Type
  : /**
   * @note The "Fn" type satisfies the predicate below.
   * It must always come first, before the Record check.
   */
  Type extends Record<string, any>
  ? {
      [Key in keyof Type]-?: NonNullable<Type[Key]> extends NonNullable<U>
        ? NonNullable<Type[Key]>
        : RequiredDeep<NonNullable<Type[Key]>, U>;
    }
  : Type;
const DEFAULT_LISTEN_OPTIONS: RequiredDeep<SharedOptions> = {
  onUnhandledRequest: "warn",
};
export function isObject(value: any): boolean {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function mergeRight(
  left: Record<string, any>,
  right: Record<string, any>
) {
  return Object.entries(right).reduce((result, [key, rightValue]) => {
    const leftValue = result[key];

    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      result[key] = leftValue.concat(rightValue);
      return result;
    }

    if (isObject(leftValue) && isObject(rightValue)) {
      result[key] = mergeRight(leftValue, rightValue);
      return result;
    }

    result[key] = rightValue;
    return result;
  }, Object.assign({}, left));
}

export class SetupEdge extends SetupApi<ServerLifecycleEventsMap> {
  private resolvedOptions: RequiredDeep<SharedOptions>;
  protected readonly interceptor: BatchInterceptor<
    Array<Interceptor<HttpRequestEventMap>>,
    HttpRequestEventMap
  >;
  constructor(
    interceptors: Array<{
      new (): any;
    }>,
    handlers: RequestHandler[]
  ) {
    super(handlers);

    this.interceptor = new BatchInterceptor({
      name: "setup-edge-server",
      interceptors: interceptors.map((Interceptor) => new Interceptor()),
    });
    this.resolvedOptions = {} as RequiredDeep<SharedOptions>;

    this.init();
  }

  public async init(): Promise<void> {
    this.interceptor.on("request", async (request) => {
      const mockedRequest = new MockedRequest(request.url, {
        ...request,
        body: await request.arrayBuffer(),
      });

      const response = await handleRequest<
        MockedInterceptedResponse & { delay?: number }
      >(
        mockedRequest,
        this.currentHandlers,
        this.resolvedOptions,
        this.emitter,
        {
          transformResponse(response) {
            return {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers.all(),
              body: response.body,
              delay: response.delay,
            };
          },
        }
      );

      if (response) {
        // Delay Node.js responses in the listener so that
        // the response lookup logic is not concerned with responding
        // in any way. The same delay is implemented in the worker.
        if (response.delay) {
          await new Promise((resolve) => {
            setTimeout(resolve, response.delay);
          });
        }

        request.respondWith(response);
      }

      return;
    });

    this.interceptor.on("response", (request, response) => {
      if (!request.id) {
        return;
      }

      if (response.headers.get("x-powered-by") === "msw") {
        this.emitter.emit("response:mocked", response, request.id);
      } else {
        this.emitter.emit("response:bypass", response, request.id);
      }
    });
  }

  public listen(options: Record<string, any> = {}): void {
    this.resolvedOptions = mergeRight(
      DEFAULT_LISTEN_OPTIONS,
      options
    ) as RequiredDeep<SharedOptions>;
    this.interceptor.apply();

    invariant(
      [InterceptorReadyState.APPLYING, InterceptorReadyState.APPLIED].includes(
        this.interceptor.readyState
      ),
      'Failed to start "setupServer": the interceptor failed to apply. This is likely an issue with the library and you should report it at "%s".',
      "https://github.com/mswjs/msw/issues/new/choose"
    );
  }

  public printHandlers() {
    const handlers = this.listHandlers();

    handlers.forEach((handler) => {
      const { header, callFrame } = handler.info;

      const pragma = handler.info.hasOwnProperty("operationType")
        ? "[graphql]"
        : "[rest]";

      console.log(`\
    Declaration: ${callFrame}
    `);
    });
  }

  public close(): void {
    super.dispose();
    this.interceptor.dispose();
  }
}

export const edge = new SetupEdge([FetchInterceptor], handlers);
