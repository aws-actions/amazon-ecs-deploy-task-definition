async function createTags(raw_tags_input){
    if(raw_tags_input){
      let raw_tags=[]
      let resp=[]
      
      try {
      console.log("formationg tags")
      raw_tags=raw_tags_input.split(' ')
      resp=raw_tags.map(x=>{
        let tag_resp={}
        console.log(x)
          let raw_tag=x.split(',')
          tag_resp.key=raw_tag[0].split('=')[1]
          tag_resp.value=raw_tag[1].split('=')[1]
          return tag_resp
        });
        return resp
      } catch (error) {
        console.log("Failed to Create Tags for ECS task definition: " + error.message);
        console.log("Tags Input content:");
        console.log(raw_tags_input);
        throw(error);
      }
    }
  }

async function run(){
  const tags=await createTags('key=InfraVersion,value=4 key=Company,value=hcc-rx key=Owner,value=pharmacy key=BusinessUnit,value=rx key=Environment,value=dev key=Service,value=companion key=Name,value=hcc-rx-qa-test-task-def');
  console.log(tags)
}
run()