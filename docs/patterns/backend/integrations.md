# Integration Patterns

Patterns for integrating external services and building resilient, observable systems.

**Guiding principle:** keep it simple. SDK and HTTP library imports live in client classes only (`http/client/`). Services work with plain Python objects. No port interfaces, no adapter hierarchies — just good encapsulation.

All paths below are relative to `app/api/`.

---

## External API Client Encapsulation

**Core principle**: the client owns ALL HTTP/SDK details. Services only know business operations.

**Client owns:**
- ✅ URLs and endpoints
- ✅ Authentication (headers, tokens, API keys)
- ✅ Request/response mapping
- ✅ Error handling and retries
- ✅ Timeouts

**Service knows:**
- ✅ Business operations only
- ❌ No URLs, no HTTP methods, no auth headers

### Pattern 1: Mock client (development / testing)

```python
# modules/campaigns/http/client/payment_gateway_client.py
import asyncio, random

class PaymentGatewayClient:
    async def process_payment(self, request: PaymentRequest) -> PaymentResponse:
        await asyncio.sleep(0.1 + random.random() * 0.2)
        if random.random() < 0.1:
            return PaymentResponse(success=False, failure_reason="Card declined")
        return PaymentResponse(success=True, transaction_id=f"PAY-{int(time.time())}")
```

### Pattern 2: HTTP client (production REST APIs)

```python
# modules/assistant/http/client/llm_client.py
class LLMClient:
    def __init__(self, config: AssistantConfig, http: HttpClient):
        self._config = config
        self._http = http

    async def complete(self, messages: list[Message]) -> str:
        try:
            response = await self._http.post(
                f"{self._config.llm_base_url}/chat/completions",
                json={"model": self._config.llm_model, "messages": [m.model_dump() for m in messages]},
                headers={"Authorization": f"Bearer {self._config.llm_api_key}"},
                timeout=30,
            )
            return response["choices"][0]["message"]["content"]
        except HttpClientException as e:
            raise DomainException(f"LLM request failed: {e}")
```

### Pattern 3: SDK client (vendor SDKs)

Wrap the SDK in a plain client class. Map SDK types to Pydantic at the class boundary so services never see the library's types.

```python
# modules/assistant/http/client/anthropic_client.py
import anthropic
from pydantic import BaseModel

class CompletionResult(BaseModel):
    content: str
    model: str
    input_tokens: int
    output_tokens: int

class AnthropicClient:
    def __init__(self, config: AssistantConfig):
        self._client = anthropic.AsyncAnthropic(api_key=config.anthropic_api_key)

    async def complete(self, messages: list[Message]) -> CompletionResult:
        raw = await self._client.messages.create(
            model=config.anthropic_model,
            max_tokens=4096,
            messages=[m.model_dump() for m in messages],
        )
        return CompletionResult(
            content=raw.content[0].text,
            model=raw.model,
            input_tokens=raw.usage.input_tokens,
            output_tokens=raw.usage.output_tokens,
        )
```

### Pattern 4: Config-driven client selection (multiple providers)

When you actually have two or more concrete implementations, a `Protocol` (or `ABC`) is the right tool — it documents the contract and keeps the service clean. Don't add it speculatively; add it the moment the second implementation exists.

```python
# modules/assistant/http/client/ai_client.py
from typing import Protocol

class AIClient(Protocol):
    async def complete(self, messages: list[Message]) -> CompletionResult: ...

# modules/assistant/http/client/anthropic_client.py
class AnthropicClient:  # satisfies AIClient structurally — no explicit `implements`
    async def complete(self, messages: list[Message]) -> CompletionResult: ...

# modules/assistant/http/client/openai_client.py
class OpenAIClient:
    async def complete(self, messages: list[Message]) -> CompletionResult: ...

# modules/assistant/dependencies.py
def get_ai_client(config: AssistantConfig = Depends(get_assistant_config)) -> AIClient:
    match config.llm_provider:
        case "anthropic": return AnthropicClient(config)
        case "openai":    return OpenAIClient(config)
        case _: raise ValueError(f"Unknown LLM provider: {config.llm_provider}")

# Service depends on the Protocol — swapping providers requires zero service changes
class AssistantService:
    def __init__(self, ai_client: AIClient): ...
```

The `Protocol` lives alongside the clients (`http/client/`), not in a separate `core/interface/` folder — it is an implementation detail of the client layer, not a cross-BC contract.

---

## Dependency Injection in FastAPI

FastAPI's `Depends()` replaces NestJS constructor injection. Keep service instantiation in factory functions, not inline in router files.

```python
# modules/campaigns/http/router/campaign_router.py
from fastapi import APIRouter, Depends
from modules.campaigns.core.service.campaign_service import CampaignService
from modules.shared.module.auth.dependencies import CurrentUser, get_current_user

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

def get_campaign_service(
    session: Session = Depends(get_campaigns_session),
) -> CampaignService:
    repo = CampaignRepository(session)
    return CampaignService(repo)

@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: CampaignService = Depends(get_campaign_service),
) -> CampaignResponse:
    campaign = await service.get_campaign(campaign_id, current_user.id)
    return CampaignResponse.model_validate(campaign)
```

**Rules:**
- ✅ Session injected via `Depends(get_{bc}_session)` — never imported globally
- ✅ Service factory functions live in the router file or a `dependencies.py` in the BC
- ✅ Router functions only call one service method
- ❌ Never instantiate services or repositories directly in router functions

---

## Structured Logging

Use `structlog` for structured JSON logs with module context.

```python
# modules/shared/module/logger/logger.py
import structlog

def get_logger(module: str) -> structlog.BoundLogger:
    return structlog.get_logger().bind(module=module)

# Usage in a service
logger = get_logger("campaigns")

async def create_campaign(self, user_id: str, name: str) -> Campaign:
    logger.info("creating campaign", user_id=user_id, name=name)
    try:
        campaign = self.repo.save(Campaign(name=name, owner_id=user_id))
        logger.info("campaign created", campaign_id=campaign.id)
        return campaign
    except Exception as e:
        logger.error("campaign creation failed", user_id=user_id, error=str(e))
        raise
```

**What to log:**
- ✅ All incoming requests (FastAPI middleware handles this)
- ✅ External API calls (endpoint, status, duration)
- ✅ Business events (campaign created, member invited)
- ✅ Errors with context (never with stack trace in production logs)

**What NOT to log:**
- ❌ Passwords, API keys, secrets
- ❌ Full JWT tokens
- ❌ Sensitive PII (hash or redact)

---

## Circuit Breakers and Graceful Degradation

Use `pybreaker` for circuit breakers on all external service calls.

```python
# modules/assistant/http/client/image_gen_client.py
import pybreaker

image_gen_breaker = pybreaker.CircuitBreaker(
    fail_max=5,
    reset_timeout=30,
)

class ImageGenClient:
    @image_gen_breaker
    async def generate(self, prompt: str) -> str:
        return await self._http.post(f"{self._base_url}/generate", json={"prompt": prompt})

    async def generate_with_fallback(self, prompt: str) -> str | None:
        try:
            return await self.generate(prompt)
        except pybreaker.CircuitBreakerError:
            logger.warning("image gen circuit open, skipping")
            return None
```

### Graceful degradation for non-critical operations

```python
async def create_wiki_document(self, ...) -> WikiDocument:
    # Core operation always proceeds
    doc = self.repo.save(WikiDocument(...))

    # Non-critical enrichment — failure must not break the main flow
    try:
        await self.search_index.index(doc)
    except Exception as e:
        logger.warning("search indexing failed, continuing", doc_id=doc.id, error=str(e))

    return doc
```

**Resilience checklist per external call:**
- [ ] Timeout configured (5–30 seconds depending on operation)
- [ ] Retry with exponential backoff (`tenacity`)
- [ ] Circuit breaker (`pybreaker`)
- [ ] Graceful degradation (fallback value or skip)
- [ ] Error logged without re-raising for non-critical paths

---

## Timeouts and Retries

Use `tenacity` for retry logic on transient failures.

```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import httpx

class PaymentGatewayClient:
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(httpx.TransportError),
    )
    async def process_payment(self, request: PaymentRequest) -> PaymentResponse:
        response = await self._http.post(
            "/charges",
            json=request.model_dump(),
            timeout=10.0,
        )
        return PaymentResponse.model_validate(response)
```

---

## Security

### Never hardcode secrets

```python
# ❌ BAD
API_KEY = "sk_live_1234567890"

# ✅ GOOD — always via Pydantic Settings from environment
class AssistantConfig(BaseSettings):
    anthropic_api_key: str
    openai_api_key: str | None = None
```

### Never share clients across BCs

```python
# ❌ BAD — importing another BC's internal client
from modules.iam.http.client.firebase_client import FirebaseClient

# ✅ GOOD — use the shared module or the BC's public Protocol
from modules.shared.module.auth.dependencies import get_current_user
```

### Validate webhook signatures

```python
@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, config: Config = Depends(get_config)):
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(payload, sig, config.stripe_webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    # process event
```

**Security checklist per integration:**
- [ ] API keys in environment variables via Pydantic Settings
- [ ] Sensitive data not logged (keys, tokens, PII)
- [ ] SSL verification enabled (never `verify=False`)
- [ ] Webhook signatures validated
- [ ] Clients never imported across BC boundaries
