export async function openFormCheckout(kind,id,capability){
 const response=await fetch('/api/payments/'+kind+'/'+id,{method:'POST',headers:{'Content-Type':'application/json','X-Payment-Receipt':capability},body:'{}',signal:AbortSignal.timeout(35000)});const body=await response.json();if(!response.ok)throw new Error(body.error||'Checkout could not be opened.');
 const returnUrl='/payment?kind='+kind+'&id='+id;if(body.returnUrl===returnUrl){location.assign(returnUrl);return;}
 const url=new URL(body.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw new Error('Checkout could not be opened.');location.assign(url.href);
}
export async function mountFormPayment(element,kind,id,capability){
 if(!element)return;const message=document.createElement('p');message.setAttribute('role','status');element.replaceChildren(message);
 try{
  const response=await fetch('/api/payments/'+kind+'/'+id,{headers:{'X-Payment-Receipt':capability},cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(body.error||'Payment status could not be checked.');
  const status=body.payment?.status;const labels={paid:'Stripe payment confirmed.',pending:'Awaiting payment.',failed:'Payment was unsuccessful.',expired:'Checkout expired. Contact ICSH before booking again.',partially_refunded:'Partially refunded. Contact ICSH about your booking.',refunded:'Payment refunded.',disputed:'Payment needs ICSH review.'};
  message.textContent=labels[status]||'Your booking is saved. Continue to Stripe to pay securely.';
  if(body.available&&body.canPay&&(!status||['pending','failed'].includes(status))){const button=document.createElement('button');button.type='button';button.className='btn full';button.textContent='Pay '+new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(body.amount/100)+' securely with Stripe';button.onclick=async()=>{button.disabled=true;try{await openFormCheckout(kind,id,capability);}catch(e){message.textContent=e.message;button.disabled=false;}};element.append(button);}
  if(!body.available&&!status)message.textContent='Online payment is currently unavailable. Please contact ICSH with your reference.';
 }catch(e){message.textContent=e.message;}
}
