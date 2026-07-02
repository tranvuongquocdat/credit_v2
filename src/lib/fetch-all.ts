// PostgREST cắt cứng tối đa 1000 dòng/response (kể cả RPC trả setof).
// Helper phân trang .range() để lấy đủ dữ liệu — dùng cho mọi query/RPC
// có thể vượt 1000 dòng (store lớn: Nam sms 1558 HĐ trả góp...).
export async function fetchAllRows(query: any, pageSize: number = 1000): Promise<any[]> {
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) {
      console.error('fetchAllRows error:', error);
      break;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return allData;
}
