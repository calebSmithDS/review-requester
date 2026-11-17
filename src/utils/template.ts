export function renderTemplate(
  template: string,
  variables: {
    first_name?: string | null;
    business_name: string;
    review_link: string;
    opt_out_link: string;
  }
): string {
  return template
    .replace(/\{first_name\}/g, variables.first_name || 'there')
    .replace(/\{business_name\}/g, variables.business_name)
    .replace(/\{review_link\}/g, variables.review_link)
    .replace(/\{opt_out_link\}/g, variables.opt_out_link);
}
