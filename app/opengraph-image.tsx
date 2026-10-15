import {ImageResponse} from 'next/og';
export const alt='Islamic & Cultural Society of Harrow — Faith. Friendship. A Sense of Belonging.';
export const size={width:1200,height:630};
export const contentType='image/png';
export default function OG(){return new ImageResponse(<div style={{display:'flex',flexDirection:'column',justifyContent:'center',width:'100%',height:'100%',background:'#4c6259',padding:'80px',color:'#f8f7f2'}}><div style={{fontSize:23,color:'#e6d6ad',marginBottom:35}}>ISLAMIC & CULTURAL SOCIETY OF HARROW</div><div style={{fontSize:76,fontFamily:'serif',lineHeight:1.15,display:'flex',flexDirection:'column'}}><span>Faith. Friendship.</span><span>A Sense of Belonging.</span></div><div style={{fontSize:22,marginTop:45}}>Community, since 1976 · Registered Charity No. 290016</div></div>,size)}
