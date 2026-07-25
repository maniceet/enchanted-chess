# Deploying Enchanted Chess

One container serves everything: the built site and the WebSocket that runs the games. That
keeps the whole thing behind a single domain with no CORS, no second service, and no shared
session store.

```
browser ──HTTPS──> ALB ──HTTP──> Fargate task (node)
                                  ├── / and /assets  the built site
                                  ├── /ws            games
                                  └── /healthz       for the load balancer
```

## Before you start

- A domain. Buy it wherever you like and move DNS to Route53, or create the hosted zone first.
- An ACM certificate for that domain **in the same region as the load balancer**, validated.
- An ECR repository.
- The AWS CLI, logged in.

## 1. Build and push the image

```bash
export AWS_REGION=eu-west-1
export ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export REPO=$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/enchanted-chess

aws ecr create-repository --repository-name enchanted-chess --region $AWS_REGION
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com

# The stack runs Fargate on Graviton, so an Apple laptop builds natively: no emulation, and
# cheaper to run. Verified locally with colima.
docker build -t $REPO:v1 .
docker push $REPO:v1
```

## 2. Bring up the stack

```bash
aws cloudformation deploy \
  --stack-name enchanted-chess \
  --template-file deploy/enchanted-chess.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      DomainName=enchantedchess.com \
      HostedZoneId=Z0123456789ABCDEFGHIJ \
      CertificateArn=arn:aws:acm:eu-west-1:$ACCOUNT:certificate/xxxxxxxx \
      ImageUri=$REPO:v1 \
      VpcId=vpc-xxxxxxxx \
      SubnetIds=subnet-aaaa,subnet-bbbb
```

The stack prints the URL when it finishes. Until DNS propagates, the load balancer's own
hostname works.

## 3. Shipping a change

```bash
docker build -t $REPO:v2 .
docker push $REPO:v2
aws cloudformation deploy --stack-name enchanted-chess \
  --template-file deploy/enchanted-chess.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides ImageUri=$REPO:v2 ...   # the rest unchanged
```

ECS drains the old task once the new one is healthy. Anyone mid-game loses their connection,
so ship between sessions until games survive a restart (see below).

## What this is not, yet

Worth knowing before you send anyone the link.

- **One task, on purpose.** Games live in the process's memory. Two tasks means two sets of
  rooms that cannot see each other, and matchmaking would pair people who never meet. Scaling
  out needs the rooms moved to a shared store, most simply Redis for the queue plus DynamoDB
  or Redis for the game state. `DesiredCount: 1` is a deliberate choice, not an oversight.
- **A restart ends games in progress.** The action log makes games replayable, so persisting
  a room and letting a player reconnect into it is a contained piece of work, but it is not
  written yet.
- **No accounts.** Every visitor is a guest with a generated name. Campaign progress and your
  standing loadout live in the browser's localStorage, so clearing site data starts the road
  over.
- **No moderation and no abuse tooling** beyond a message size cap, a rate limit and an
  origin allowlist. There is no chat, which removes most of the problem.

## Running it locally the way production does

Either straight from Node:

```bash
npm run build       # produces dist/
npm run server      # serves dist/ and /ws on :8080
```

Or in the container it will actually ship in, which is the honest test:

```bash
colima start            # once per boot, if you use colima
docker compose up --build
open http://localhost:8080
```

`docker compose down` stops it. The compose file mirrors the task definition, so what passes
here is what runs on Fargate.

In development the site runs on Vite's port and the game server on 8080, and the client knows
to look there. Set `VITE_WS_URL` at build time if you ever split them across hosts.

## Environment

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8080` | Port the process listens on |
| `STATIC_DIR` | `./dist` | Where the built site lives |
| `ALLOWED_ORIGINS` | empty | Comma separated. Empty means allow any origin, which is fine locally and wrong in production. The stack sets it to your domain. |

## Health and logs

`/healthz` returns `{"ok":true,"rooms":N,"seeking":N}`. The load balancer polls it every 15
seconds, and it is also the quickest way to see whether anyone is playing. Container logs go
to CloudWatch under the stack's log group.
