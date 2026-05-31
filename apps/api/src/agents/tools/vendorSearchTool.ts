export type VendorSearchInput = {
  category: string;
  serviceArea?: string;
};

export function vendorSearchTool(input: VendorSearchInput): string {
  return `vendor_search:${input.category}:${input.serviceArea ?? "any"}`;
}
