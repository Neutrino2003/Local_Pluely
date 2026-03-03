// Pluely proprietary API is disabled — always use user-configured curl providers.
export async function shouldUsePluelyAPI(): Promise<boolean> {
  return false;
}
