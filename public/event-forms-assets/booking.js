import {capacityNotice,capacityMessage} from './capacity.js';
import {openFormCheckout} from './payments.js';
export function createBookingUI({api,esc,money,main,go,submitAction}){
 const $=s=>main.querySelector(s);
 const statusLabel=q=>({active:'Active ICSH Member',inactive:'Membership inactive or expired',non_member:'Non-Member',ambiguous:'Membership needs review',unavailable:'Membership check unavailable',unverified:'Membership not verified · Non-member rate'})[q.memberStatus];
 async function formPage(e){if(e.limitReached)setTimeout(()=>capacityNotice(),0);
  document.title=e.title+' · ICSH';const hasChildren=e.rates.child!==undefined&&e.rates.childNonmember!==undefined; let generation=0,timer,current=null,inflight='',fallback=false,promoCode='';const hasDiscounts=Boolean(e.discountCodesAvailable)&&!e.prototype;
  const requestKey=crypto.randomUUID(),capability=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const open=e.status==='published'&&new Date(e.startsAt)>new Date()&&e.remaining>0;
  main.innerHTML=`<a class="back" href="/events">← ICSH events</a><section class="event-header"><p class="eyebrow">${e.prototype?'Membership pricing prototype':'ICSH · Event registration'}</p><h1>${esc(e.title)}</h1><p>${esc(e.description)}</p>${e.prototype?'<div class="notice"><strong>Prototype · event details are placeholders.</strong><p>This demonstrates membership lookup and group pricing. Saving does not reserve a real place. No payment is taken.</p></div>':`<p style="${e.slug==='icsh-winter-lunch-2026'?'font-size:1.125em;font-weight:700;line-height:1.6':''}">${esc(new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(e.startsAt)))} – ${esc(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Europe/London'}).format(new Date(e.endsAt)))} (UK time)<br>${esc(e.venue)}</p>`}</section>${open?`<form id="booking-form" class="split booking-layout"><div class="booking-fields"><section class="panel"><p class="eyebrow">01 · Your booking</p><h2>Start with your email.</h2><p class="small">Your email determines the rate for everyone in this booking.</p><div class="field"><label for="booking-email">Email Address *</label><input id="booking-email" name="email" type="email" autocomplete="email" required maxlength="254" aria-describedby="booking-check" placeholder="you@example.com"></div><div class="field"><label for="booking-quantity">${hasChildren?'Number of adults (12+)':'Number of Attendees'} *</label><input id="booking-quantity" name="quantity" type="number" min="${hasChildren?0:1}" max="12" step="1" ${hasChildren?'':'required'} placeholder="0"></div>${hasChildren?'<div class="field"><label for="booking-children">Number of children under 12</label><input id="booking-children" name="childQuantity" type="number" min="0" max="12" step="1" placeholder="0"></div>':''}<div id="booking-check" role="status" aria-live="polite" aria-atomic="true"><p class="small">Enter your email to see your event price.</p></div><div class="inline-links"><button id="booking-retry" class="btn secondary tiny hidden" type="button">Retry membership check</button><button id="booking-nonmember" class="btn secondary tiny hidden" type="button">Continue as a non-member · ${money(e.rates.nonmember)} ${hasChildren?'per adult':'per person'}${hasChildren?` / ${money(e.rates.childNonmember)} per child`:''}</button></div></section><section class="panel"><p class="eyebrow">02 · Main booker details</p><div class="row"><div class="field"><label for="booking-first">First Name *</label><input id="booking-first" name="firstName" autocomplete="given-name" required maxlength="80"></div><div class="field"><label for="booking-last">Last Name *</label><input id="booking-last" name="lastName" autocomplete="family-name" required maxlength="80"></div></div><div class="field"><label for="booking-mobile">Mobile Number *</label><input id="booking-mobile" name="mobile" type="tel" autocomplete="tel" required maxlength="25"><small class="muted">UK number, or include + and your international country code.</small></div><div class="field"><label for="booking-dietary">Any dietary requirements</label><textarea id="booking-dietary" name="dietaryRequirements" maxlength="2000"></textarea><small class="muted">Only include arrangements needed for this booking.</small></div><div class="field"><label for="booking-notes">Additional notes</label><textarea id="booking-notes" name="additionalNotes" maxlength="2000"></textarea></div><div class="honeypot" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div></section><section class="panel"><p class="eyebrow">03 · Everyone attending</p><h2>Attendee names</h2><p class="small">Enter a first and last name for every adult and child. Include the main booker only if they are attending.</p><div id="booking-attendees"><p class="small">Select your tickets above to add attendee names.</p></div></section>${hasDiscounts?'<section class="panel"><p class="eyebrow">04 · Discounts</p><h2>Have a discount code?</h2><div class="field"><label for="booking-promo-code">Have a discount code?</label><input id="booking-promo-code" type="text" maxlength="32" autocomplete="off" placeholder="Enter code" autocapitalize="characters"></div><div class="inline-links"><button type="button" class="btn secondary" id="booking-apply-code">Apply Code</button><button type="button" class="btn secondary tiny hidden" id="booking-remove-code">Remove code</button></div><p id="booking-promo-message" class="small" role="status" aria-live="polite"></p></section>':''}</div><aside class="panel sticky booking-summary"><p class="eyebrow">Your booking</p><h3>Booking summary</h3><div class="summary-row"><span>Membership Status</span><strong id="booking-status">Not checked</strong></div><div class="summary-row"><span>${hasChildren?'Adults (12+)':'Tickets'}<small id="booking-adult-detail" class="booking-tier-meta">0 × —</small></span><strong id="booking-adult-subtotal">—</strong></div>${hasChildren?'<div class="summary-row"><span>Children under 12<small id="booking-child-detail" class="booking-tier-meta">0 × —</small></span><strong id="booking-child-subtotal">—</strong></div>':''}<div class="summary-row"><span>Attendees</span><strong id="booking-count">0</strong></div><div class="summary-row hidden" id="booking-original-row"><span>Original tickets</span><strong id="booking-original">—</strong></div><div class="summary-row hidden" id="booking-savings-row"><span id="booking-discount-title">Discount</span><strong id="booking-savings">—</strong></div><div class="summary-row total"><span id="booking-total-label">Total Amount</span><strong id="booking-total">—</strong></div><p id="booking-summary-discount" class="small hidden"></p><p id="booking-calculation" class="small">Your price appears after the membership check.</p><hr class="divider"><p class="small">${e.membershipPricingRule==='active'?'Active members':'Active paid members'}: ${money(e.rates.member)} ${hasChildren?'per adult':'per person'}${hasChildren?` · ${money(e.rates.child)} per child`:''}.<br>Non-members: ${money(e.rates.nonmember)} ${hasChildren?'per adult':'per person'}${hasChildren?` · ${money(e.rates.childNonmember)} per child`:''}.</p></aside><section class="panel booking-checkout"><h2>Before you submit</h2><p class="small">${esc(e.eventTerms||'Your registration remains subject to event availability and any required payment.')}</p><div id="booking-submit-message" role="alert"></div><p class="small submission-declaration">By submitting your registration, you agree to the event terms above, confirm that your information is true and accurate, and acknowledge our <a href="/privacy" target="_blank" rel="noopener noreferrer" aria-label="Privacy policy (opens in a new tab)">privacy policy</a>.</p><button class="btn full" type="submit" disabled>${e.prototype?'Save prototype registration':'Submit registration'}</button><p class="small">Paid bookings continue to Stripe. Keep your confirmation link.</p></section></form>`:'<section class="panel"><h2>Registration is closed</h2><p>This form is not accepting new registrations.</p></section>'}`;
  if(!open)return;
  const form=$('#booking-form'),email=$('#booking-email'),quantity=$('#booking-quantity'),childQuantity=$('#booking-children'),button=form.querySelector('button[type=submit]');
  const ticketCount=()=>Number(quantity.value)+Number(childQuantity?.value||0);
  const attendeeNames=new Map();
  const selectedAttendees=()=>['adult','child'].flatMap(ticket=>Array.from({length:Math.max(0,Math.min(12,Math.floor(Number((ticket==='adult'?quantity:childQuantity)?.value)||0)))},(_,index)=>({key:ticket+'-'+index,ticket,index})));
  function renderAttendees(){
   const target=$('#booking-attendees');target.querySelectorAll('[data-person]').forEach(row=>attendeeNames.set(row.dataset.person,{firstName:row.querySelector('[data-first]').value,lastName:row.querySelector('[data-last]').value}));
   const slots=selectedAttendees();
   target.innerHTML=slots.length?slots.map(slot=>{const saved=attendeeNames.get(slot.key)||{firstName:'',lastName:''};return `<fieldset class="attendee" data-person="${slot.key}"><legend>${hasChildren?(slot.ticket==='child'?'Child':'Adult'):'Attendee'} ${slot.index+1}</legend>${slot.ticket==='adult'&&slot.index===0?'<button type="button" class="btn secondary tiny" id="booking-copy-booker">Use main booker’s name for this attendee</button>':''}<div class="row"><div class="field"><label for="${slot.key}-first">First name *</label><input id="${slot.key}-first" data-first required maxlength="80" autocomplete="off" value="${esc(saved.firstName)}"></div><div class="field"><label for="${slot.key}-last">Last name *</label><input id="${slot.key}-last" data-last required maxlength="80" autocomplete="off" value="${esc(saved.lastName)}"></div></div></fieldset>`;}).join(''):'<p class="small">Select your tickets above to add attendee names.</p>';
   const copy=$('#booking-copy-booker');if(copy)copy.onclick=()=>{const row=copy.closest('[data-person]');row.querySelector('[data-first]').value=$('#booking-first').value;row.querySelector('[data-last]').value=$('#booking-last').value;};
  }
  function showDiscountStatus(message){
   const summary=$('#booking-summary-discount');
   summary.textContent=message;
   summary.classList.toggle('hidden',!message);
  }
  const key=()=>JSON.stringify([email.value.trim().toLowerCase(),ticketCount(),Number(childQuantity?.value||0),fallback,promoCode]);
  function renderQuote(q,message=''){
   const adults=Number(quantity.value||0),children=Number(childQuantity?.value||0);
   const priceKnown = q?.unitAmount != null;
   $('#booking-count').textContent=String(adults+children);$('#booking-status').textContent=q?statusLabel(q):'Not checked';
   $('#booking-adult-detail').textContent=adults+' × '+(priceKnown?money(q.unitAmount):'—')+' each';
   $('#booking-adult-subtotal').textContent=priceKnown&&adults?money(adults*q.unitAmount):'—';
   if(hasChildren){
    const childPrice=priceKnown?(children?q.childUnitAmount:(q.discountEligible?e.rates.child:e.rates.childNonmember)):null;
    $('#booking-child-detail').textContent=children+' × '+(childPrice===null?'—':money(childPrice))+' each';
    $('#booking-child-subtotal').textContent=priceKnown&&children?money(children*(q.childUnitAmount??0)):'—';
   }
   const promotion=q?.promotion;
    $('#booking-total').textContent=q?.canRegister?money(promotion?.payablePence??q.total):'—';
    $('#booking-original-row').classList.toggle('hidden',!promotion);
    $('#booking-savings-row').classList.toggle('hidden',!promotion);
    $('#booking-original').textContent=promotion?money(promotion.grossPence):'—';
    $('#booking-discount-title').textContent=promotion?`${promotion.name} (${promotion.code})`:'Discount';
    $('#booking-total-label').textContent=promotion?'Discounted total':'Total Amount';
    $('#booking-savings').textContent=promotion?'-'+money(promotion.discountPence):'—';
    if(promotion)showDiscountStatus('');
    if(hasDiscounts){$('#booking-remove-code').classList.toggle('hidden',!promoCode);if(promotion)$('#booking-promo-message').textContent=promotion.name+' applied · '+money(promotion.discountPence)+' off your tickets.';}
   $('#booking-calculation').textContent=q?.canRegister?'Each selected ticket tier is itemised above.':priceKnown?'Select your tickets to see the booking total.':'Your prices appear after the membership check.';
   $('#booking-check').innerHTML=priceKnown?`<div class="membership-result ${q.discountEligible?'active':''}"><strong>${esc(statusLabel(q))}</strong><p>Your Event Price: ${money(q.unitAmount)} ${hasChildren?'per adult':'per person'}${hasChildren?` · ${money(q.discountEligible?e.rates.child:e.rates.childNonmember)} per child under 12`:''}</p>${q.memberStatus==='active'&&!q.discountEligible?'<p class="small">The standard rate applies. Event discounts require an active membership with completed membership payment.</p>':''}</div>`:message?`<div class="notice">${esc(message)}</div>`:'<p class="small">Enter your email to see your event price.</p>';
   const retry=Boolean(q&&!priceKnown);$('#booking-retry').classList.toggle('hidden',!retry);$('#booking-nonmember').classList.toggle('hidden',!retry);button.disabled=!q?.canRegister;
  }
  async function check(force=false){
   clearTimeout(timer);if(!email.value||!email.checkValidity()||(quantity.value&&!quantity.checkValidity())||(childQuantity?.value&&!childQuantity.checkValidity())||ticketCount()<0||ticketCount()>12){current=null;renderQuote(null);return;}
   const queryKey=key();if(!force&&(inflight===queryKey||current?.key===queryKey))return;
   const id=++generation;inflight=queryKey;current=null;renderQuote(null,'Checking your ICSH membership...');$('#booking-status').textContent='Checking…';
   try{
    const result=await api('booking/quote',{method:'POST',body:{eventId:e.id,email:email.value.trim().toLowerCase(),quantity:ticketCount(),childQuantity:Number(childQuantity?.value||0),continueAsNonMember:fallback,...(promoCode&&ticketCount()>0?{discountCode:promoCode}:{})}});
    if(id!==generation||queryKey!==key())return;
    if(result.quote.configurationVersion!==e.version){current=null;renderQuote(null,'Event settings have changed. Reload this page to review the latest details, terms and prices.');return;}
    if(hasDiscounts&&result.discountError){
     promoCode='';
     const message='Code not applied. '+result.discountError;
     $('#booking-promo-message').textContent=message;
     showDiscountStatus(message);
    }
    current={key:key(),quote:result.quote};renderQuote(result.quote,result.message);
    }catch(error){if(id!==generation||queryKey!==key())return;current=null;
     const message=promoCode&&error instanceof Error?error.message:"We couldn't verify your ICSH membership automatically. Please try again or continue as a non-member.";
     renderQuote({memberStatus:'unavailable',canRegister:false,unitAmount:null,total:null},message);
     if(hasDiscounts&&promoCode)$('#booking-promo-message').textContent=message;
    }
   finally{if(id===generation)inflight='';}
  }
  function changed(){renderAttendees();generation++;inflight='';fallback=false;current=null;clearTimeout(timer);renderQuote(null);$('#booking-submit-message').textContent='';timer=setTimeout(()=>check(),500);}
  email.oninput=changed;email.onblur=()=>check();quantity.oninput=changed;quantity.onchange=()=>check();if(childQuantity){childQuantity.oninput=changed;childQuantity.onchange=()=>check();}
  $('#booking-retry').onclick=()=>{fallback=false;check(true);};$('#booking-nonmember').onclick=()=>{fallback=true;check(true);};
   if(hasDiscounts){
    $('#booking-apply-code').onclick=()=>{
     showDiscountStatus('');const value=$('#booking-promo-code').value.trim();if(!value){$('#booking-promo-message').textContent='Enter a discount code.';return;}if(ticketCount()===0){$('#booking-promo-message').textContent='Select tickets before applying a discount code.';return;}promoCode=value.toUpperCase();$('#booking-promo-message').textContent='Checking code…';check(true);};
    $('#booking-remove-code').onclick=()=>{showDiscountStatus('');promoCode='';$('#booking-promo-code').value='';$('#booking-promo-message').textContent='Discount code removed.';check(true);};
    $('#booking-promo-code').addEventListener('input',()=>{showDiscountStatus('');if(promoCode){promoCode='';$('#booking-promo-message').textContent='Apply the new code to see your discount.';check(true);}});
   }
  form.onsubmit=async ev=>{ev.preventDefault();if(!current?.quote.canRegister||current.key!==key())return;
   await submitAction(form,async()=>{form.inert=true;try{
    const data=new FormData(form),q=current.quote;
    const input={eventId:e.id,idempotencyKey:requestKey,firstName:String(data.get('firstName')).trim(),lastName:String(data.get('lastName')).trim(),email:email.value.trim().toLowerCase(),mobile:String(data.get('mobile')).trim(),quantity:ticketCount(),childQuantity:Number(childQuantity?.value||0),attendees:[...$('#booking-attendees').querySelectorAll('[data-person]')].map(row=>({firstName:row.querySelector('[data-first]').value.trim(),lastName:row.querySelector('[data-last]').value.trim()})),dietaryRequirements:String(data.get('dietaryRequirements')||''),additionalNotes:String(data.get('additionalNotes')||''),terms:true,continueAsNonMember:fallback,website:String(data.get('website')||''),expectedQuote:{configurationVersion:q.configurationVersion,unitAmount:q.unitAmount,total:q.total,...(q.promotion?{discountPence:q.promotion.discountPence,payablePence:q.promotion.payablePence}:{})},...(promoCode?{discountCode:promoCode}:{})};
    const result=await api('booking/registrations',{method:'POST',body:input,capability});sessionStorage.setItem('icsh-registration-'+result.registration.id,result.token);if(result.registration.total>0&&result.registration.mode==='live'){try{await openFormCheckout('event',result.registration.id,result.token);return;}catch{/* The saved confirmation provides a payment retry. */}}go('/checkout/'+result.registration.id);
   }catch(error){if(error.quote){if(error.quote.configurationVersion!==e.version){current=null;renderQuote(null,'Event settings have changed. Reload this page to review the latest details, terms and prices.');return;}current={key:key(),quote:error.quote};renderQuote(error.quote,error.message);$('#booking-submit-message').textContent=error.message;return;}throw error;}
   finally{form.inert=false;}
  });if(form.isConnected)button.disabled=form.dataset.capacityReached==='true'||!current?.quote.canRegister;};
 }
 return{formPage};
}
