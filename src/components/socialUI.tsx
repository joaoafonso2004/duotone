import React from 'react';
import { Modal,Platform,Pressable,ScrollView,StyleSheet,Text,View,KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export const socialStyles=StyleSheet.create({
  body:{flex:1}, content:{padding:24,gap:18,paddingBottom:120}, text:{color:'#F3F2F7',fontSize:15},
  muted:{color:'#A6A4B3',fontSize:13,lineHeight:20}, title:{color:'#F3F2F7',fontSize:23,fontWeight:'700'},
  label:{color:'#B3ADCA',fontSize:11,fontWeight:'700',letterSpacing:1.5,textTransform:'uppercase'},
  row:{flexDirection:'row',alignItems:'center',gap:12}, card:{backgroundColor:'#191920',padding:16,borderRadius:18,gap:12,borderWidth:1,borderColor:'#2C2A36'},
  button:{paddingHorizontal:16,paddingVertical:12,borderRadius:12,backgroundColor:'#302943',alignItems:'center'},
  buttonText:{color:'#EEE8FF',fontWeight:'600',fontSize:13}, input:{color:'#F3F2F7',backgroundColor:'#111117',borderWidth:1,borderColor:'#383341',borderRadius:12,padding:13,fontSize:15},
  error:{color:'#F5ADB2',fontSize:13,lineHeight:19}, badge:{color:'#DACBFF',fontWeight:'700',fontSize:12},
});
export function SocialButton({children,onPress,disabled=false,quiet=false}:{children:React.ReactNode;onPress:()=>void;disabled?:boolean;quiet?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[socialStyles.button,quiet&&{backgroundColor:'transparent'},disabled&&{opacity:0.4}]}><Text style={socialStyles.buttonText}>{children}</Text></Pressable>;
}
export function SocialModal({visible,title,onClose,children}:{visible:boolean;title:string;onClose:()=>void;children:React.ReactNode}) {
  const safe=useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1,backgroundColor:'#0009',justifyContent:'center',alignItems:'center',paddingTop:safe.top+12,paddingBottom:safe.bottom+12,paddingHorizontal:12}}>
      <View style={{width:'100%',maxWidth:680,maxHeight:'100%',backgroundColor:'#121117',borderColor:'#34303F',borderWidth:1,borderRadius:24,overflow:'hidden'}}>
        <View style={[socialStyles.row,{padding:20,borderBottomWidth:1,borderColor:'#292633'}]}><Text style={[socialStyles.title,{flex:1,fontSize:19}]}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={12}><Ionicons name="close" size={24} color="#DDD7EB"/></Pressable></View>
        {children}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
