# Property API (Backend)

Backend for the website that finds properties by interior preferences and budget.
Built with **Node.js**, **Express** and **Mongoose** (MongoDB). It uses the `property_platform` database made in the Database task.

## What is installed

| Package | Why |
|---|---|
| express | The web server |
| mongoose | Talks to MongoDB using models |
| jsonwebtoken | Login tokens (JWT) |
| bcryptjs | Hashes passwords |
| express-rate-limit | Stops people from trying many passwords |
| dotenv | Reads settings from the `.env` file |
| cors | Lets the frontend call this API |
| helmet | Adds safe security headers |
| morgan | Shows each request in the terminal |
| nodemon (dev) | Restarts the server when you save a file |

Full API documentation: [`docs/API_Documentation_C_Sri_Harsha.pdf`](docs/API_Documentation_C_Sri_Harsha.pdf). Postman collection: `docs/Property_API.postman_collection.json`.

## Folder structure (MVC)

```
property-api/
├── index.js                  Starts everything: connects to MongoDB, then starts the server
├── .env.example              Example settings (copy to .env)
├── docs/                     Postman collection for testing
├── src/
│   ├── app.js                Builds the Express app (middleware + routes)
│   ├── config/               env.js (settings), db.js (MongoDB connection)
│   ├── models/               M: Property, User, UserPreference, RevokedToken
│   ├── controllers/          C: the logic for each request (health, property, preference, search, auth)
│   ├── routes/               The URLs. Each URL calls a controller
│   ├── services/             Database work used by controllers (auth, property, preference)
│   ├── validators/           Checks the data people send (auth, property, preference)
│   ├── middleware/           auth (checks token), validate, upload (multer), rateLimit, error, requireDb
│   └── utils/                ApiError, token, query + propertyFilter, searchCriteria + searchRank (search algorithm), files
├── uploads/                  Uploaded images (made automatically, not in git)
└── test/                     Tests (npm test)
```

The request goes: **route → (middleware) → controller → service → model → MongoDB**, and the answer goes back as JSON.

## How to run (Windows)

1. Make sure MongoDB is running and you ran the seed from the Database task.
2. Open Command Prompt in this folder and run:
   ```
   npm install
   copy .env.example .env
   ```
   (If you already have a `.env`, add the two new lines `ADMIN_EMAILS=harsha@example.com` and `UPLOAD_DIR=uploads`.)
3. Open `.env` (`notepad .env`) and change `JWT_SECRET` to any long random text.
4. Start the server: `npm run dev`
5. Open http://localhost:3000/api/health. It should show `"database":"connected"`.

| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start with auto restart (nodemon) |
| `npm test` | Run the tests (no database needed) |

## URLs

| Method | URL | Login needed? | What it does |
|---|---|---|---|
| GET | `/api/health` | No | Shows if the server and database work |
| POST | `/api/auth/signup` | No | Create an account, get a token |
| POST | `/api/auth/login` | No | Log in, get a token |
| POST | `/api/auth/logout` | **Yes** | Log out (cancels the token) |
| GET | `/api/auth/me` | **Yes** | Shows the logged-in user |
| GET | `/api/properties` | No | Search properties with budget and interior filters (see below) |
| GET | `/api/properties/recommended` | **Yes** | Properties that match the logged-in user's saved preferences |
| GET | `/api/properties/:propertyID` | No | One property |
| POST | `/api/properties` | **Yes** | Add a property (you become the owner) |
| PATCH | `/api/properties/:propertyID` | **Yes** (owner) | Change some fields |
| DELETE | `/api/properties/:propertyID` | **Yes** (owner) | Delete property and its uploaded images |
| POST | `/api/properties/:propertyID/images` | **Yes** (owner) | Upload up to 5 images (form field `images`) |
| DELETE | `/api/properties/:propertyID/images` | **Yes** (owner) | Remove one image. Body: `{"image":"<link>"}` |
| POST | `/api/preferences` | **Yes** | Save my preferences (one record per user) |
| GET | `/api/preferences/me` | **Yes** | See my preferences |
| PATCH | `/api/preferences/me` | **Yes** | Change my preferences (a field you send replaces the old one) |
| DELETE | `/api/preferences/me` | **Yes** | Delete my preferences |
| GET | `/uploads/properties/<file>` | No | An uploaded image |
| GET | `/api/search` | No (Yes with `usePreferences=true`) | **Search algorithm**: filter, score and sort properties |
## How authentication works

1. **Signup or login** gives you a `token` (a JWT). It is valid for 7 days (`JWT_EXPIRES_IN` in `.env`).
2. For protected URLs, send the token in a header: `Authorization: Bearer <token>`
3. The middleware `src/middleware/auth.js` checks that the token is real, not expired, not logged out, and that the user still exists.
4. **Logout** saves the token's ID in the `revokedTokens` collection, so that token stops working at once. MongoDB deletes the record by itself after the token would have expired anyway.
5. Passwords are never saved. Only a bcrypt hash is saved, and it is never sent back in any answer.

### Signup

`POST /api/auth/signup`
```json
{ "username": "new_user", "email": "new@example.com", "password": "Passw0rd123" }
```
- username: 3 to 30 letters, numbers or `_`
- password: 8 to 72 characters with at least one letter and one number

Answer `201`:
```json
{ "token": "eyJhbGciOi...", "user": { "userID": "u_1a2b3c4d", "username": "new_user", "email": "new@example.com", "dateJoined": "2026-10-16T06:50:00.000Z" } }
```

### Login

`POST /api/auth/login`: send `email` (or `username`) and `password`.
```json
{ "email": "harsha@example.com", "password": "Test@1234" }
```
Answer `200`: same shape as signup. (`harsha@example.com` is a sample user from the seed.)

### Logout and Me

`POST /api/auth/logout` and `GET /api/auth/me`: send the `Authorization: Bearer <token>` header. Logout answers `{ "message": "Logged out" }`.

## Errors

Every error has the same shape: `{ "error": { "code": "...", "message": "...", "details": [...] } }`

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | A value is wrong (details lists each field) |
| 400 | `INVALID_JSON` | The body is not valid JSON |
| 401 | `UNAUTHORIZED` | No token sent |
| 401 | `INVALID_TOKEN` | Token is fake or changed |
| 401 | `TOKEN_EXPIRED` | Token is too old, log in again |
| 401 | `TOKEN_REVOKED` | You logged out with this token |
| 401 | `INVALID_CREDENTIALS` | Wrong email/username or password |
| 404 | `NOT_FOUND` | No such URL |
| 409 | `CONFLICT` | Email or username already used |
| 429 | `RATE_LIMITED` | More than 20 login/signup tries in 15 minutes |
| 503 | `DB_UNAVAILABLE` | MongoDB is not connected |

## Try it in Windows PowerShell

(Use **PowerShell**, not Command Prompt. The server must be running in another window.)

```powershell
# 1. Log in and keep the token
$r = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"email":"harsha@example.com","password":"Test@1234"}'
$token = $r.token

# 2. Who am I?
Invoke-RestMethod -Uri http://localhost:3000/api/auth/me -Headers @{ Authorization = "Bearer $token" }

# 3. Log out
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/logout -Headers @{ Authorization = "Bearer $token" }

# 4. Try /me again: this should fail with 401 TOKEN_REVOKED
Invoke-RestMethod -Uri http://localhost:3000/api/auth/me -Headers @{ Authorization = "Bearer $token" }
```

Or import `docs/Property_API.postman_collection.json` into Postman. The login and signup requests save the token by themselves.

## Property filters (budget and interior)

All are optional and can be mixed: `GET /api/properties?minPrice=5000000&maxPrice=10000000&minBhk=2&furnishing=Semi-furnished,Fully-furnished&modularKitchen=true`

| Filter | Meaning |
|---|---|
| `minPrice`, `maxPrice` | Budget range (rupees) |
| `bhk` or `minBhk` | Exact BHK, or this many or more |
| `furnishing` | `Unfurnished`, `Semi-furnished`, `Fully-furnished` (comma list = any of them) |
| `flooringType`, `style` | Text, comma list = any of them (not case sensitive) |
| `modularKitchen`, `available` | `true` or `false` |
| `locality`, `city`, `q` | Area (comma list), city, or part of the name |
| `sort` | `price_asc` (default), `price_desc`, `newest` |
| `page`, `limit` | Paging (limit up to 50, default 10) |

A wrong value gives `400 VALIDATION_ERROR` with the list of problems. `GET /api/properties/recommended` does the same filtering using the saved preferences (budget, locations, minimum BHK, furnishing, flooring, style, modular kitchen) and shows only available properties.

## Who can change a property

The user who created it, and any user whose email is in `ADMIN_EMAILS` in `.env`. The seed properties have no owner, so add `ADMIN_EMAILS=harsha@example.com` to `.env` to edit them. Others get `403 FORBIDDEN`.

## Image upload rules

- Form field name: `images`, up to 5 files per request, 5 MB each, JPG / PNG / WEBP only.
- The owner check happens before the file is saved. The file name is random, and the first bytes of the file are checked, so a fake image is rejected and deleted.
- A property can have 20 images. Too big gives `413 FILE_TOO_LARGE`.
- In normal JSON (`POST` or `PATCH` property), `images` accepts only outside `http(s)` links.

## Try property and preference APIs in PowerShell

```powershell
$r = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"email":"harsha@example.com","password":"Test@1234"}'
$token = $r.token
$h = @{ Authorization = "Bearer $token" }

# Search by budget and interior
Invoke-RestMethod "http://localhost:3000/api/properties?minPrice=5000000&maxPrice=10000000&minBhk=2&modularKitchen=true" | ConvertTo-Json -Depth 6

# Add a property
$body = '{"name":"Test Flat","price":5000000,"location":{"address":"1 Main Rd","city":"Bengaluru","locality":"Indiranagar","pincode":"560038"},"interiorFeatures":{"bhk":2,"flooringType":"Vitrified","furnishing":"Semi-furnished","areaSqFt":1000}}'
$p = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/properties -Headers $h -ContentType "application/json" -Body $body
$id = $p.data.propertyID

# Upload an image (use curl.exe, not curl)
curl.exe -X POST -H "Authorization: Bearer $token" -F "images=@C:\Users\harsha\Pictures\room.jpg" http://localhost:3000/api/properties/$id/images

# Save preferences, then see recommendations
$pref = '{"preferredLocation":["HSR Layout","Indiranagar"],"budgetRange":{"min":5000000,"max":10000000},"interiorPreferences":{"minBhk":2,"furnishing":["Semi-furnished"],"modularKitchen":true}}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/preferences -Headers $h -ContentType "application/json" -Body $pref
Invoke-RestMethod -Uri http://localhost:3000/api/properties/recommended -Headers $h | ConvertTo-Json -Depth 6
```

## Search algorithm: `GET /api/search`

The search works in two stages.

1. **Filter (MongoDB).** Budget (`minPrice`, `maxPrice`), availability (available only by default) and `city` always remove properties that cannot fit. At most 500 candidates (cheapest first) go to stage 2.
2. **Score and sort (the app).** Each property gets a **relevance score from 0 to 100** from how well it matches the user's wishes. Only the wishes that are given are counted, so a short wish list can still reach 100.

| Wish | Points | How it matches |
|---|---|---|
| Locality (`locality`) | 25 | The property's locality is in the list |
| BHK (`minBhk` or exact `bhk`) | 20 | BHK is at least `minBhk`, or equal to `bhk` |
| Furnishing | 15 | Furnishing is in the list |
| Flooring | 10 | Flooring is in the list |
| Style | 10 | Style is in the list |
| Modular kitchen | 10 | Same as the wish (true or false) |
| Budget fit | 10 | Inside the budget it gets 4 to 10 points: the cheaper, the more |

Score = points earned / points possible x 100. Every result has `relevance: { score, matched: [...], missed: [...] }`, so the user can see why it ranked there. With no wishes, `score` is `null` and the order is cheapest first.

| Parameter | Meaning |
|---|---|
| `usePreferences=true` | Use my saved preferences as the wishes (login needed). Values in the URL win over them. |
| `strict=true` | Every wish must match. Properties that miss a wish are removed, not just ranked lower. |
| `minScore` | Hide properties with a score below this (0 to 100) |
| `sort` | `relevance` (default: best score first, cheaper wins a tie), `price_asc`, `price_desc`, `area_desc`, `location` (A to Z), `newest` |
| `minPrice`, `maxPrice`, `bhk`, `minBhk`, `furnishing`, `flooringType`, `style`, `modularKitchen`, `locality`, `city`, `available` | Same as the property filters above |
| `page`, `limit` | Paging (limit up to 50, default 10) |

The answer also has `total`, `pages`, `sort`, `strict`, the `criteria` that were used, and `truncated` (true if more than 500 properties passed the budget filter; narrow the budget to see all).

Examples:
```
/api/search?minPrice=5000000&maxPrice=10000000&minBhk=2&furnishing=Semi-furnished&modularKitchen=true
/api/search?usePreferences=true
/api/search?usePreferences=true&strict=true&sort=price_asc
/api/search?maxPrice=12000000&locality=Koramangala,Indiranagar&sort=location
```

## Locations for all of India, photos and the map (final update)

- `GET /api/locations/suggest?q=hyd&limit=8` returns place suggestions for the search box: Indian cities (list in `src/data/indiaCities.json`, 87 cities in 30+ states) plus areas that already have homes in the database. Each item has `type` (`city` or `locality`), `name`, `city`, `state`, `lat`, `lng` (and `homes` for areas). The list grows by itself when homes are added in a new area.
- `GET /api/search` also accepts `city=` and `state=`. A city or area in `locality=` is used as a wish (it adds score) and with `strict=true` it must match the area or the city.
- A home's `location` now has an optional `state`, plus `latitude` and `longitude` that the map uses.
- Each home has `images` (a list). Sample homes have 4 pictures each, served from `/uploads/seed/...`. Real photos are added with `POST /api/properties/:id/images`.
- `npm run seed` puts 55 sample homes (19 cities) into MongoDB. It is safe to run many times.

## Next tasks

The front end that uses these APIs.
