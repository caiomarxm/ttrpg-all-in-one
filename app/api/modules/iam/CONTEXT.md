# IAM

IAM answers one question: who are you, and are you authenticated? It owns user identity and issues tokens consumed by all other bounded contexts.

## Language

**User**:
An authenticated identity in the system. Carries a display name and avatar; holds no campaign roles (those live in Campaigns).
_Avoid_: Account, member, player, identity

**Token**:
A signed credential issued to a User upon successful authentication. Presented on every request so other bounded contexts can resolve the calling User.
_Avoid_: JWT, session, auth header, bearer

## Relationships

- A **Token** is issued to exactly one **User**
- All bounded contexts validate incoming requests against a **Token** to identify the calling **User**

## Example dialogue

> **Dev:** "Does IAM know what role a User has in a campaign?"
> **Domain expert:** "No — IAM only knows who the User is. Campaign roles live in Campaigns."
> **Dev:** "So IAM just hands out a Token and other BCs do the rest?"
> **Domain expert:** "Exactly. Any BC that needs to know 'who is this?' validates the Token. Any BC that needs to know 'what can they do?' resolves that itself."

## Flagged ambiguities

- "Profile" was considered as a separate term for display name and avatar — resolved: these are attributes of **User**, not a distinct concept.
