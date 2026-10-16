import type { CartLine, Customer, Order, OrderQuote, Product } from './types';
import { receiptToken, rememberReceipt, type OrderReceipt } from './order-receipts';
import { API } from './assets';
export { API, assetUrl, shopLogoUrl } from './assets';
export class ApiError extends Error {
  constructor(message: string, readonly fields?: Record<string, string>) { super(message); }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API}${path}`, { cache: 'no-store', ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message || 'Request failed', body.fields);
  return body;
}
export const api={
  wishlist:(key:string)=>request<{productIds:string[]}>('/wishlist',{headers:{Authorization:`Wishlist ${key}`}}),
  saveWishlist:(key:string,id:string,saved:boolean)=>request<{saved:boolean}>(`/wishlist/${encodeURIComponent(id)}`,{method:saved?'PUT':'DELETE',headers:{Authorization:`Wishlist ${key}`}}),
  catalog:()=>request<any>('/catalog'),
  quote:(items:CartLine[],customer:Customer,customerCategoryId:string)=>request<OrderQuote>('/orders/quote',{method:'POST',body:JSON.stringify({items,customer,customerCategoryId})}),
  order:async(items:CartLine[],customer:Customer,customerCategoryId:string,key?:string)=>request<Order>('/orders',{method:'POST',headers:key?{'x-checkout-key':key}:{},body:JSON.stringify({items,customer,customerCategoryId})}),
  cancel:(id:string,token=receiptToken(id))=>request<Order>(`/orders/${encodeURIComponent(id)}/cancel`,{method:'POST',headers:{'x-order-token':token||''}}),
  track:async(id:string,phone='',token=receiptToken(id))=>{const order=await request<Order>(`/orders/${encodeURIComponent(id)}${token?'':`?phone=${encodeURIComponent(phone)}`}`,{headers:token?{'x-order-token':token}:{}});if(order.trackingToken)rememberReceipt(order.id,order.trackingToken);return order;},
  customerOrders:(credentials:OrderReceipt[])=>request<Order[]>('/orders/lookup',{method:'POST',body:JSON.stringify({credentials})}),
  pushConfig:()=>request<{enabled:boolean;publicKey:string|null}>('/push/config'),
  subscribe:(id:string,token:string,subscription:PushSubscriptionJSON)=>request<{subscribed:boolean}>(`/push/orders/${encodeURIComponent(id)}`,{method:'POST',headers:{'x-order-token':token},body:JSON.stringify(subscription)}),
  unsubscribe:(id:string,token:string,endpoint:string)=>request<{subscribed:boolean}>(`/push/orders/${encodeURIComponent(id)}`,{method:'DELETE',headers:{'x-order-token':token},body:JSON.stringify({endpoint})}),
  reference:(id:string,reference:string,token=receiptToken(id))=>request<Order>(`/orders/${id}/payment-reference`,{method:'POST',headers:{'x-order-token':token||''},body:JSON.stringify({reference})}),
  login:(username:string,password:string)=>request<{accessToken:string}>('/auth/login',{method:'POST',body:JSON.stringify({username,password})}),
  changePassword:(token:string,passwords:{currentPassword:string;newPassword:string;confirmPassword:string})=>request<{message:string}>('/auth/password',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(passwords)}),
  admin:<T>(path:string,token:string,init?:RequestInit)=>request<T>(`/admin${path}`,{...init,headers:{Authorization:`Bearer ${token}`,...(init?.headers||{})}}),
  updateProduct:(p:Product,token:string)=>request<Product>(`/admin/products/${p.id}`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(p)}),
};
