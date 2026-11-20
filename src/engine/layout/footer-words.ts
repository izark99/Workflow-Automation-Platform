// Generic words that mark the end of a table or a total row in a report exported from another system (SPEC 13.2 item 6).
// A short list in English and Vietnamese, kept in this one module. Never an employee ID, a name or a number of any data.

/** A row that starts with one of these under a table is a footer: who prepared it, who signs it, when it was printed. */
export const FOOTER_WORDS: readonly string[] = [
  // English
  'Prepared by',
  'Created by',
  'Checked by',
  'Approved by',
  'Reviewed by',
  'Signature',
  'Signed',
  'Printed on',
  'Printed by',
  'Page ',
  'Date and place',
  'Note:',
  'Notes:',
  // Vietnamese
  'Người lập',
  'Người duyệt',
  'Người kiểm tra',
  'Ký tên',
  'Chữ ký',
  'Kế toán trưởng',
  'Giám đốc',
  'Ngày',
  'Ghi chú',
];

/** A row inside a table that starts with one of these in a text cell is a total row, not data. Longest first. */
export const TOTAL_WORDS: readonly string[] = ['Grand total', 'Subtotal', 'Sub-total', 'Total', 'Tổng cộng', 'Tổng', 'Cộng'];
