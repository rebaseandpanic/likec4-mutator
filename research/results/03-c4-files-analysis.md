# Analysis of real .c4 files from LikeC4

## 1. Projects found

### Official examples (likec4/likec4)

In the `likec4/likec4` repository, **88 files** .c4/.likec4 were found in the following directories:

| Directory | Files | Description |
|---|---|---|
| `examples/cloud-system/` | 10 | Main example — cloud system with deployment |
| `examples/multi-project/boutique/` | 7 | E-commerce system, multi-project configuration |
| `examples/multi-project/projectA/` | 10 | Cloud-system clone for multi-project |
| `examples/diagrams-dev/` | 4 | Style and color demonstration |
| `apps/playground/src/examples/` | 9 | Playground examples (bigbank, dynamic, deployment, rank) |
| `apps/docs/src/components/` | 11 | Documentation examples |
| `e2e/src/likec4/` | 9 | E2E tests |
| `packages/create-likec4/template/` | 4 | Template for `create-likec4` |
| `examples/multi-metadata-extend/` | 3 | Model extension via metadata |
| `examples/multi-relation-extend/` | 3 | Relationship extension |

### Public projects on GitHub

GitHub search revealed **246+ matches** with `specification element extension:c4`. Most interesting projects:

| Repository | Description | .c4 files | Constructs |
|---|---|---|---|
| **SpecterOps/BloodHound** | AD/Azure attack analysis platform | 12 | specification, relationship kinds, tags, technology, views with predicates |
| **crashteamdev/ke-analytics** | Marketplace analytics | 1 | Minimal specification, model with components |
| **NHSDigital/rossbuggins** | NHS Digital architecture | 5+ | No deploymentNode, custom colors, AWS icons, relationship kinds |
| **mira-amm/mira-amm-web** | DeFi AMM platform | 3+ | Extensive custom color palette, actor/persona/brand kinds |
| **prev0id/soa** | Social network (SOA) | 1 | Basic model, inline style, icons |
| **a-scolan/c4-template** | C4 architecture template | 3+ | Multi-project, spec-containers |
| **felippebutland/DocumentFlow** | Document management | 2+ | _spec.c4 + model |
| **elf-pavlik/lws-auth** | OIDC authentication | 1 | Specialized model |
| **inferno-cu/inferno** | Cloud system | 3+ | Architecture with cloud broker |
| **uptickmetachu/example-likec4-skill** | Claude skill for LikeC4 | 1+ | AWS microservices template |

**Typical projects**: student projects on SOA/microservices (>50% of those found), architectural descriptions of SaaS products, team templates.

## 2. DSL construct frequency table

### Constructs found in almost every project (>90%)

| Construct | Frequency | Example |
|---|---|---|
| `specification { }` | 100% | Root specification block |
| `element <kind>` | 100% | Element type definition |
| `model { }` | 100% | Root model block |
| `<name> = <kind> 'Title'` | 100% | Element definition with assignment |
| `description '...'` | ~95% | Element description |
| `style { }` (inline) | ~90% | Inline element styling |
| `->` (relationships) | ~95% | Relationship definition |
| `views { }` | ~85% | Views block |
| `view <name> { }` | ~85% | Named view |
| `include` / `exclude` | ~85% | View predicates |
| Nested elements | ~80% | Children inside parent |
| `shape <type>` | ~80% | person, storage, browser, queue |
| `icon <pack>:<name>` | ~75% | tech:postgresql, aws:lambda |

### Medium frequency constructs (30-70%)

| Construct | Frequency | Example |
|---|---|---|
| `tag <name>` | ~60% | `tag deprecated`, `tag next` |
| `#tag` (application) | ~60% | `#deprecated`, `#api` |
| `technology '...'` | ~55% | `technology 'Go'`, `technology 'REST'` |
| `view <name> of <element>` | ~50% | Scoped views |
| `style <selector> { }` (in view) | ~50% | Styling in view |
| `autoLayout <dir>` | ~45% | TopBottom, LeftRight, BottomTop |
| `relationship <kind>` | ~40% | In specification block |
| `extend <element>` | ~40% | Model extension in another file |
| `color <name>` | ~35% | `color primary`, `color amber` |
| `opacity <N>%` | ~35% | `opacity 10%`, `opacity 40%` |
| `notation '...'` | ~35% | Type label on the diagram |
| `link <url>` | ~30% | External links |
| `title '...'` | ~50% | View or element title |

### Low frequency constructs (10-30%)

| Construct | Frequency | Example |
|---|---|---|
| `dynamic view` | ~25% | Dynamic views |
| `parallel { }` | ~20% | Parallel steps in dynamic view |
| `notes '...'` | ~20% | Notes for dynamic view steps |
| `deployment { }` | ~20% | Deployment model |
| `deploymentNode <kind>` | ~20% | Deployment node type definition |
| `instanceOf <element>` | ~20% | Placement in deployment |
| `deployment view` | ~20% | Deployment views |
| `navigateTo <view>` | ~20% | Navigation between views |
| `metadata { }` | ~15% | Metadata (key-value) |
| `group '...' { }` | ~15% | Grouping in views |
| `color <name> #hex` | ~15% | Custom colors in specification |
| `with { }` | ~15% | Modifiers in predicates |
| `-[<kind>]->` | ~15% | Typed relationship |
| `.uses` / `.solid` | ~10% | Dot-prefix relationship syntax |
| `multiple true` | ~10% | Multiple instances |
| `line solid/dotted/dashed` | ~10% | Relationship line style |

### Rare/exotic constructs (<10%)

| Construct | Frequency | Example |
|---|---|---|
| `border none/solid/dashed` | ~5% | Container border |
| `view extends <view>` | ~5% | View inheritance |
| `size sm/md/lg` | ~5% | Element size |
| `textSize` | <5% | Text size |
| `padding` | <5% | Inner padding |
| `iconPosition` | <5% | Icon position |
| `iconColor` | <5% | Icon color |
| `iconSize` | <5% | Icon size |
| `summary '...'` | <5% | Short description |
| `head`/`tail` (arrow types) | <5% | Arrow types |
| `global predicate` | <5% | Global predicates |
| `environment` (deployment) | ~10% | Environment in deployment |
| `tag <name> { color ... }` | ~5% | Tag with style |
| `rgba(...)` | ~5% | RGBA colors |
| `description: '...'` (with colon) | ~10% | Alternative syntax with colon |
| `title: '...'` (with colon) | ~10% | Alternative syntax with colon |
| `rank same/min/max` | <5% | Ranking constraints |
| `<-` (reverse relationship) | ~10% | In dynamic views |
| `this`/`it` | ~5% | Reference to current element |
| `api -> api 'process'` | ~5% | Self-reference |

## 3. Typical file sizes and patterns

### File sizes

| File type | Lines (typical) | Lines (range) |
|---|---|---|
| `_spec.c4` (specification) | 50-100 | 20-200 |
| Model (model.c4) | 80-220 | 30-500+ |
| Views (views.c4) | 40-100 | 20-200 |
| Deployment | 60-140 | 30-200 |
| Combined file | 100-300 | 50-600+ |

**Average file size**: ~80-120 lines

### File organization patterns

1. **Separation by concern** (most common):
   - `_spec.c4` — specification (element kinds, tags, relationship kinds)
   - `model.c4` — main model
   - `views.c4` — views
   - `deployment.c4` — deployment
   - `externals.c4` — external systems

2. **By subsystem** (for large projects):
   - `cloud/ui.c4`, `cloud/next.c4`, `cloud/legacy.c4`

3. **Single file** (for simple projects):
   - Everything in one file (specification + model + views)

### Nesting depth

| Level | Example | Frequency |
|---|---|---|
| 1 | `system` | 100% |
| 2 | `system > container` | ~80% |
| 3 | `system > container > component` | ~60% |
| 4 | `system > container > component > subcomponent` | ~20% |
| 5+ | Deeper | <5% |

**Typical depth**: 2-3 levels

### Commonly defined element kinds

| Kind | Frequency | Description |
|---|---|---|
| `actor` | ~90% | User/persona (shape: person) |
| `system` | ~85% | Software system |
| `container` | ~70% | Application container |
| `component` | ~70% | Component |
| `database` | ~60% | Database (shape: storage) |
| `service` | ~40% | Service/microservice |
| `externalSystem` | ~40% | External system |
| `app` / `webapp` | ~25% | Application (shape: browser) |
| `queue` | ~20% | Message queue (shape: queue) |
| `lambda` / `function` | ~15% | Serverless function |
| `mobileApp` / `mobile` | ~10% | Mobile application (shape: mobile) |
| `table` / `db_table` | ~10% | Database table |

## 4. Documentation constructs vs real-world usage

### Constructs from documentation (https://likec4.dev)

Documentation describes 18 pages of DSL reference:

**Specification**: element, relationship, tag, color, style, deploymentNode
**Model**: element definition, description, summary, technology, title, tags, links, metadata, nested elements
**Relationships**: `->`, `-[kind]->`, `.kind`, title, description, technology, tags, links, navigateTo, metadata
**References**: FQN with dots, scoping, bubbling
**Extend**: extend element, extend relationship, metadata merging
**Styling**: shape (10 types), color, opacity, border, multiple, icon, iconColor, iconSize, iconPosition, size, padding, textSize, line (3 types), head/tail (8 types)
**Views**: view, view of, view extends, dynamic view, deployment view
**Predicates**: include/exclude, `*`, `.*`, `.**`, `._`, `->`, `<->`, where (kind/tag/metadata), with-clause
**Dynamic views**: steps, parallel, notes, `<-` (reverse direction)
**Deployment**: deployment node kinds, instanceOf, environment, deployment relationships
**Organization**: folder paths in title (`/`), views with common path
**Config**: .likec4 config files, extends, include/exclude paths, imageAliases

### Constructs missing from our specification (need attention)

Based on comparison of real-world usage and documentation:

1. **`summary`** — short description, displayed on the diagram (fallback: description)
2. **`global predicate`** — reusable predicates
3. **`rank same/min/max/source/sink`** — ranking constraints for layout
4. **`head`/`tail` arrow types** — arrow types (normal, onormal, diamond, odiamond, crow, vee, open, none)
5. **`iconPosition`** — left, right, top, bottom
6. **`iconColor`** — icon color
7. **`iconSize`** — icon size
8. **`padding`** — padding
9. **`textSize`** — text size
10. **`size`** — xsmall, small, medium, large, xlarge
11. **`border`** — dashed, dotted, solid, none
12. **`views 'path' { }`** — common folder path for views
13. **`it` / `this`** — reference to current element in nested context
14. **Colon syntax** — `description: '...'`, `title: '...'` (alternative without colon)
15. **`inferTechnologyFromIcon`** — auto-detect technology from icon
16. **`implicitViews`** — auto-generation of scoped views
17. **`imageAliases`** — aliases for image paths (`@alias`)
18. **Triple-quoted strings** — `'''...'''` and `"""..."""` for multiline markdown
19. **`environment`** (in deployment) — special type of deploymentNode
20. **`color rgba(...)`** — RGBA colors in specification and tag definition

## 5. Recommendations for test fixtures

### Minimal fixture set

1. **minimal-spec.c4** — minimal specification (3-5 element kinds, 1-2 tags)
2. **minimal-model.c4** — simple model (3-5 elements, 2-3 relationships)
3. **minimal-view.c4** — simple view (include *, style)

### Medium fixture set

4. **medium-spec.c4** — specification with relationship kinds, custom colors, notation, style
5. **medium-model.c4** — model with extend, metadata, links, technology, tags, 3 levels of nesting
6. **medium-views.c4** — views with of, predicates (include/exclude), autoLayout, groups, style selectors, with-clause
7. **dynamic-view.c4** — dynamic view with parallel, notes, navigateTo
8. **deployment.c4** — deploymentNode kinds, deployment model with instanceOf, deployment view

### Extended fixture set (edge cases)

9. **complex-predicates.c4** — where-clauses (kind, tag, metadata), `.*`, `.**`, `._`, `<->`, `-> el ->`
10. **extend-model.c4** — extend element + extend relationship + metadata merge
11. **custom-styling.c4** — all style properties: shape, color, opacity, border, multiple, icon, size, padding, textSize
12. **multi-file-project/** — directory with 4-5 files, simulating a real project
13. **edge-cases.c4** — self-reference (`api -> api`), reverse arrow (`<-`), typed relationships (`-[kind]->`), dot-prefix (`.uses`), triple-quoted strings, colon syntax

### Priorities for mutation testing

Most important constructs for mutations (by frequency and criticality):

1. **Highest priority**: specification/element, model/element definition, relationships (`->`), views/include/exclude
2. **Medium priority**: tags, style properties, technology, description, extend, deployment
3. **Low priority**: metadata, links, navigateTo, global predicates, rank, arrow types, iconPosition
