# CI-CD

## Visual Studo Code Market pusblishing

The repo uses the `vsce` npm package.
For that a public access token (PAT) was generated, encrypted and added to [.travis.yml](../.travis.yml).

### Generating PAT (for myself)

- Goto [https://marketplace.visualstudio.com/manage]() or [https://dev.azure.com/matepek/\_usersSettings/tokens]()
- Sign in
- Click on your name at the upper-right corner
- Change organisation to Microsoft Account
- Click on `matepek.visualstudio.com`.

This will bring you to [https://matepek.visualstudio.com/](). One cans start directly from here.

- Upper-right corner context menu on the icon next to my profile picutre: Personal access tokens
- Create PAT:
  - Organisation has to be "All accessible ..."
  - Scope: Custom: Marketplace: Aquire, Manage

With travis package: `travis encrypt VSCE_PAT=...`
