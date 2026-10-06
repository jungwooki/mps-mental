// Never echo response bodies: they can contain consultation text or provider details.
export async function readApiResponse(response) {
  const body = await response.text();
  let value;
  try {
    if (!body.trim()) throw new Error('empty');
    value = JSON.parse(body);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
  } catch {
    const message = response.status === 401 ? '로그인이 만료되었습니다. 다시 로그인해주세요.'
      : response.status === 403 ? '상담 기록 접근 권한을 확인해주세요.'
      : response.status === 429 ? '요청이 많습니다. 잠시 후 다시 시도해주세요.'
      : !body.trim() ? 'AI 서비스 응답이 비어 있습니다. 잠시 후 다시 시도해주세요.'
      : 'AI 서비스에서 올바른 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.';
    const error = new Error(message);
    error.name = 'ApiResponseError';
    error.status = response.status;
    throw error;
  }
  return value;
}

export function apiErrorMessage(error) {
  const message = String(error?.message || '');
  if (error instanceof SyntaxError || /Unexpected end of JSON|Failed to execute ['"]json['"]|JSON\.parse/i.test(message)) {
    return 'AI 서비스 응답이 비어 있거나 중단되었습니다. 잠시 후 다시 시도해주세요.';
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return '서비스에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해주세요.';
  }
  return message || '상담 처리에 실패했습니다. 다시 시도해주세요.';
}
