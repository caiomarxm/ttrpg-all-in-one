# Campaigns

Campaigns is the top-level organizing context: it groups Members under a named world, assigns coarse-grained roles, and controls who belongs.

## Language

**Campaign**:
A named world and its collection of Members, owned by a Game Master.
_Avoid_: Game, room, group, session

**Member**:
Any participant in a Campaign. Holds exactly one role: Game Master or Player.
_Avoid_: User, participant, account

**Game Master**:
The Member who owns and runs a Campaign; has full control over it.
_Avoid_: GM, Master, DM, Dungeon Master, owner, admin

**Player**:
A Member who participates in a Campaign as an invited adventurer; has scoped access.
_Avoid_: User, participant, guest

**Invitation**:
A request for a User to join a Campaign as a Player. Has a lifecycle: pending → accepted or rejected.
_Avoid_: Invite, request, link

## Relationships

- A **Campaign** has exactly one **Game Master**
- A **Campaign** has zero or more **Players**
- **Game Master** and **Player** are both **Members** of a **Campaign**
- A **Member** holds exactly one role within a given **Campaign** (a User can hold different roles across different Campaigns)
- An **Invitation**, once accepted, makes the invited User a **Player** of the **Campaign**

## Example dialogue

> **Dev:** "When a Game Master invites someone by email, do they immediately become a Member?"
> **Domain expert:** "No — they receive an Invitation. They become a Member only once they accept it."
> **Dev:** "And what role do they get?"
> **Domain expert:** "Always Player. Only the Campaign owner holds the Game Master role."

## Flagged ambiguities

- "Player" was initially proposed as the umbrella term for any campaign participant — resolved: **Member** is the umbrella term; **Player** is the non-GM role specifically.
