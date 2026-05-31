# Sovereign Ops API Contract

This API is a deterministic, local-first advisor routing service. It does not call external services, execute real-world actions, contact vendors, change credentials, or make binding decisions.

## Service Health

### `GET /health`

Returns service health metadata.

Success response:

```json
{
  "status": "ok",
  "service": "sovereign-ops-api",
  "version": "0.1.0",
  "timestamp": "2026-05-27T00:00:00.000Z"
}
```

## Advisor Routing

### `POST /agents/route`

Routes a user request to a deterministic advisor, returns matching skills, and includes a plan with concrete next steps.

Headers:

```http
Content-Type: application/json
X-Request-Id: optional-client-request-id
```

Request body:

```json
{
  "message": "The vendor needs gate access for maintenance."
}
```

`query` is accepted as an alias for `message`.

Validation rules:

- Body must be valid JSON.
- `Content-Type` must include `application/json`.
- Request body must include `message` or `query`.
- Input must be a non-empty string.
- Input must not exceed 4,000 characters.

Success response example:

```json
{
  "advisor": "Estate Advisor",
  "category": "property/staff/maintenance",
  "confidence": "medium",
  "matchedKeywords": ["maintenance"],
  "reason": "Matched property/staff/maintenance keyword(s): maintenance.",
  "nextAction": "Route to estate operations review.",
  "skills": [
    {
      "id": "maintenance_triage",
      "name": "Maintenance Triage",
      "advisor": "Estate Advisor",
      "category": "property/staff/maintenance",
      "description": "Prioritize maintenance issues by urgency and operational impact.",
      "inputHints": ["issue description", "severity", "affected area"],
      "outputType": "maintenance_priority_plan",
      "riskLevel": "Medium"
    }
  ],
  "plan": {
    "advisor": "Estate Advisor",
    "category": "property/staff/maintenance",
    "confidence": "medium",
    "summary": "Build an estate operations plan for property condition, maintenance priority, and staff coordination.",
    "steps": [
      {
        "id": "estate_plan_1",
        "advisor": "Estate Advisor",
        "skillId": "property_health_check",
        "title": "Check property health",
        "description": "Review known property context and identify affected systems or open issues.",
        "priority": "medium",
        "requiresHumanApproval": false,
        "expectedOutput": "Property issue summary"
      }
    ],
    "safeguards": ["Protect property access.", "Document maintenance decisions."],
    "missingInputs": []
  },
  "requestId": "req_example"
}
```

The live response may include additional compatibility fields such as `executionPlan` and `actionPlan`.

## Error Format

All API errors return JSON:

```json
{
  "error": {
    "code": "INVALID_ROUTE_INPUT",
    "message": "Route message cannot be empty.",
    "details": {
      "reason": "empty_string"
    },
    "requestId": "req_example"
  }
}
```

Common errors:

### Invalid JSON

```json
{
  "error": {
    "code": "INVALID_JSON",
    "message": "Invalid JSON body.",
    "details": {},
    "requestId": "req_example"
  }
}
```

### Invalid Route Input

```json
{
  "error": {
    "code": "INVALID_ROUTE_INPUT",
    "message": "Request body must include a message or query field.",
    "details": {
      "expectedFields": ["message", "query"]
    },
    "requestId": "req_example"
  }
}
```

### Unsupported Method

```json
{
  "error": {
    "code": "UNSUPPORTED_METHOD",
    "message": "Method GET is not supported for /agents/route.",
    "details": {
      "method": "GET",
      "path": "/agents/route"
    },
    "requestId": "req_example"
  }
}
```

### Unknown Route

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Not found.",
    "details": {
      "path": "/unknown"
    },
    "requestId": "req_example"
  }
}
```

## Advisor Categories

- `Estate Advisor`: `property/staff/maintenance`
- `Security Advisor`: `passwords/access/security`
- `Vendor Advisor`: `contractors/vendors`
- `Concierge Advisor`: `lifestyle/logistics`
- `Compliance Advisor`: `contracts/risk/legal/privacy`
- `Operations Advisor`: `unknown/unclear`

## Fallback Behavior

If no route keyword matches, the API returns `Operations Advisor` with category `unknown/unclear`. The plan focuses on clarifying the objective, priority, owner, and deadline before routing to a more specific advisor.

## Deterministic Plan Behavior

Plans are rule-based and deterministic:

- No LLM calls are made.
- No external integrations are called.
- A maximum of five plan steps is returned.
- Plan steps use only skills returned for the selected advisor.
- Security, Vendor, and Compliance plans mark sensitive steps as requiring human approval.
- Concierge and Estate plans require approval when the request involves staff, vendors, access, money, privacy, or legal risk.
