# Superstore Volume Rebate - Deployment Steps

1. Install the dotnet-hosting-8.0.32-win as administrator, go to cmd and run iisreset
2. Run the table scripts (Scripts folder, from 01 to 13 in order) on the working DB
3. Create one main folder inside inetpub\wwwroot with a short name and no spaces (for example SVR), and put inside it 3 folders: Auth, API and Frontend
4. Put the web app's latest version in the Frontend folder, then convert this folder to application in IIS
5. Put the authentication service's latest version in the Auth folder, then convert this folder to application in IIS with its own new app pool set to No Managed Code
6. Put the web service's latest version in the API folder, then convert this folder to application in IIS with its own new app pool set to No Managed Code
7. right click the folder called assets inside the API folder > Properties > Security > Edit > select IIS_IUSRS > tick Modify > OK
8. Change config.json AUTH_BASE to http://server-IP/main-folder's name/Auth/api
9. Change config.json API_BASE to http://server-IP/main-folder's name/API/api
10. Change the connection string in both appsettings.json files (Auth and API) to the client's DB
11. Change Location in the API's appsettings.json to the client's store location code
12. Open http://server-IP/main-folder's name/Frontend/#/volumerebate in the browser and log in to test

Example with the main folder called SVR:
- Web app: http://server-IP/SVR/Frontend/#/volumerebate
- AUTH_BASE: http://server-IP/SVR/Auth/api
- API_BASE: http://server-IP/SVR/API/api

Notes:
- The URL always follows the folder path inside wwwroot: server-IP / main folder / app folder.
- Use the server's IP in the URLs, not localhost, so other computers can open it.
- The folder path comes before the #, and the page (volumerebate) comes after it. Use only one #.
- Opening the main folder without /Frontend/ gives Forbidden, always add /Frontend/.
- The Auth and API must each have their own app pool, or IIS shows error 500.35.
- If the API shows error 500.30, the assets folder is missing or IIS_IUSRS does not have Modify on it (step 7).
- If you publish a new version, stop the app pool first, copy the files, then start it again.
- Do not overwrite appsettings.json, config.json or the assets folder on the client's server when you update.
