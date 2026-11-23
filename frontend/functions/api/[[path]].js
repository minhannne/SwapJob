export async function onRequest({ request }) {
  const backendUrl = new URL(request.url)

  backendUrl.protocol = 'https:'
  backendUrl.host = 'swapjob-api.onrender.com'

  const backendRequest = new Request(backendUrl.toString(), request)
  backendRequest.headers.delete('host')

  return fetch(backendRequest, {
    redirect: 'manual',
  })
}