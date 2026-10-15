// whatsapp-web.js adds a webdriver-hiding flag when it launches Chromium itself.
// Launch a normal, visibly automated Chromium first and use its documented connect path.
// No custom user-agent, webdriver patches, CSP bypass, stealth or sandbox removal.
export function transparentAuthClass(RemoteAuth,puppeteer){
 return class TransparentRemoteAuth extends RemoteAuth {
  async destroy(){
   try{await super.destroy();}finally{await this.startedBrowser?.close().catch(()=>{});}
  }
  async beforeBrowserInitialized(){
   if(this.startedBrowser)throw Error('RECONNECT_REQUIRES_ADMIN');
   await super.beforeBrowserInitialized();
   const options=this.client.options.puppeteer;
   this.startedBrowser=await puppeteer.launch({...options,args:[]});
   this.client.options.userAgent=false;
   this.client.options.bypassCSP=false;
   this.client.options.puppeteer={...options,browserWSEndpoint:this.startedBrowser.wsEndpoint()};
  }
 };
}
