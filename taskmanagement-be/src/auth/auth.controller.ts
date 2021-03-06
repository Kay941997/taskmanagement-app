/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
  Session,
  Get,
  Param,
  HttpCode,
  Res,
  Request,
  UsePipes,
  Put,
  ParseIntPipe,
  Delete,
  Patch,
  ClassSerializerInterceptor,
  UseInterceptors,
  BadGatewayException
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthCredentialsDto } from './dto/authCredentials.dto';
import { AuthGuard } from '@nestjs/passport';
import { RequestWithUser } from './interface/requestWithUser.interface';
import { request, Response } from 'express';
import { LocalAuthGuard } from './utils/guard/localAuthGuard.guard';
import * as bcrypt from 'bcrypt';
// import { AuthenticatedGuard } from './utils/guard/authGuard.guard';
import { JwtAuthGuard } from './utils/guard/jwtAuthGuard.guard';
import { AppAbility, CaslAbilityFactory } from 'src/casl/casl-ability.factory';
import { PoliciesGuard } from 'src/casl/policiesGuard.guard';
import { CheckPolicies } from 'src/casl/casl-ability.decorator';
import { Action } from 'src/casl/casl-action.enum';
import { UserEntity } from './entity/user.entity';
import { UpdateUserDto } from './dto/updateUser.dto';
import JwtRefreshGuard from './utils/guard/jwtRefreshTokenGuard.guard';
import JwtRefreshTokenGuard from './utils/guard/jwtRefreshTokenGuard.guard';
import { UserDtoFirebase } from './dto/userDtoFirebase.dto';
import { FirebaseAuthGuard } from 'src/firebase/firebase-auth.guard';

import * as firebase from 'firebase/app';
import * as auth from 'firebase/auth';

// const firebase_params = {
//   type: process.env.FIREBASE_TYPE,
//   projectId: process.env.FIREBASE_PROJECT_ID,
//   privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
//   privateKey: process.env.FIREBASE_PRIVATE_KEY,
//   clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
//   clientId: process.env.FIREBASE_CLIENT_ID,
//   authUri: process.env.FIREBASE_AUTH_URI,
//   tokenUri: process.env.FIREBASE_TOKEN_URI,
//   authProviderX509CertUrl: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
//   clientC509CertUrl: process.env.FIREBASE_CLIENT_X509_CERT_URL,
// };

// firebase.initializeApp(firebase_params);
// auth.initializeAuth(firebase.getApp());

@Controller('auth') //localhost:3000/api/auth
@UseInterceptors(ClassSerializerInterceptor) //!Serialize (tr??? v??? nh??ng ko hi???n th??? @Exclude Entity)
export class AuthController {
  constructor(
    private readonly authService: AuthService, //!private: v???a khai b??o v???a injected v???a kh???i t???o
    private caslAbilityFactory: CaslAbilityFactory) {}

  //!SignUp:
  @Post('/signup')
  @UsePipes(ValidationPipe) //c?? ho???c kh??ng v?? ???? c?? Global Validation
  signUp(@Body() authCreadentialsDto: AuthCredentialsDto) {
    return this.authService.signUp(authCreadentialsDto);
  }

  // //!SignUp Firebase:
  // @Post('/signupfirebase')
  // signUpFirebase(@Body() body) {
  //   const {email, password} = body;
  //   console.log(email, password);

  //   auth
  //     .createUserWithEmailAndPassword(auth.getAuth(), email, password)
  //     .then(async (user) => {
  //       return user;
  //     })
  //     .catch((err: any) => {
  //       throw new BadGatewayException(err);
  //     })
  // }

 

  //!SignIn:
  //todo: SignIn save (AccessToken, RefreshToken in Cookie) (CurrentRefreshToken in Database)
  @HttpCode(200)
  @UseGuards(LocalAuthGuard) //!LocalStrategy X??c th???c ng?????i d??ng
  @Post('/signin')
  async signIn(@Request() req: RequestWithUser){ //!req l???y th??ng tin t??? LocalAuthGuard
    const user = req.user;
    user.password = undefined;

    //!Access Token:
    const accessTokenCookie = this.authService.getCookieWithJwtAccessToken(user) 

    //!Refresh Token:
    const { 
      cookie: refreshTokenCookie, 
      token: refreshToken 
    } 
    = this.authService.getCookieWithJwtRefreshToken(user.id);

    //!setCurrentRefreshToken Hash:
    await this.authService.setCurrentRefreshToken(refreshToken, user.id)

    //Cookie:
    req.res.setHeader('Set-Cookie', [accessTokenCookie, refreshTokenCookie]);

    //Return:
    return {
      ...user,
      accessTokenCookie, 
      refreshTokenCookie
    }

  }


  //!Refresh:
  @UseGuards(JwtRefreshTokenGuard)
  @Post('refresh')
  refresh(@Req() request) {
    console.log("??ang v??o Refresh Controller...")
    
    const user = request.user
    console.log(user, "User in Refresh Controller")

    const accessTokenCookie = this.authService.getCookieWithJwtAccessToken(user);
 
    request.res.setHeader('Set-Cookie', accessTokenCookie);
    return user;
  }

  //!LogOut:
  //todo: LogOut = Access Token -> CurrentRefreshToken = Null
  @UseGuards(JwtAuthGuard)
  @Post('signout')
  @HttpCode(200)
  async logOut(@Req() request: RequestWithUser) {
    await this.authService.removeRefreshToken(request.user.id);
    request.res.setHeader('Set-Cookie', this.authService.getCookiesForLogOut());
  }


  // //!Protected (Session Cookie Kh??ng c???n nh???p t??i kho???n):
  // @UseGuards(AuthenticatedGuard) //!Remove SessionCookie to use Guard JWTToken return access_token = BearerToken check SessionCookie:
  // @Get('/protected')
  // getHello(@Request() req): string{
  //   return req.user; //!return with jwtStrategy
  // }

  //!Get Self Info After Guard SignIn:
  @Get('/profile')
  @UseGuards(JwtAuthGuard)
  getSelfInfo(@Req() request) { //!request l???y th??ng tin t??? JWTToken
    const user = request.user;
    user.password = undefined;
    return user; //kh??ng c?? logic ??? service n??n return user lu??n
  }

  //!Get All Users:
  @Get()
  findAllUsers() {
    return this.authService.findAllUsers();
  }

  

  //!Get User By Id: (C???n d??ng):
  //!(???? xong) V?? tr??ng /:username: (Thay = /username/:username)
  @Get('/:id')
  getUserInfoById(@Param('id', ParseIntPipe) id: number) {
    return this.authService.findUserById(id);
  }

  //!Get User By Username: (Kh??ng c???n d??ng):
  //!(???? xong) V?? tr??ng /:id: (Thay = /username/:username)
  @Get('/username/:username')
  getUserInfoByUsername(@Param('username') username: string) {
    return this.authService.findUserByUsername(username);
  }

  //!Update User Advanced CASL Role:
  @Patch('/:id') //d??ng Patch thay cho Put
  @UseGuards(JwtAuthGuard)
  @UsePipes(ValidationPipe)
  async updateTask(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: RequestWithUser, //!(Req after LogIn) use in CASL
  ): Promise<UserEntity> {
    //todo: CASL to Role + isCreator:
    //todo: CASL to Service:
    const user = req.user
    //!(???? xong) L???i update xong b??? sai t??i kho???n v?? ch??a bcrypt:
    return this.authService.updateUser(id, updateUserDto, user);
  }

  //!Delete User Advanced CASL Role isAdmin isCreator:
  //!(???? xong) n???u x??a 1 User ph???i x??a c??? c??c relation:
  @Delete('/:id')
  //todo: CASL cho v??o Service:
  @UseGuards(JwtAuthGuard) //!JwtAuthGuard
  async deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser, //!(Req after LogIn) use in CASL
  ): Promise<void> {
    const user = req.user

    return this.authService.deleteUser(id, user);
  }
  

  // //!Log Out: (Kh??ng c???n l??m v?? l?? c???a Frontend)
  // @UseGuards(JwtAuthGuard)
  // @Post('signout')
  // async logOut(@Req() request: RequestWithUser, @Res() response: Response) {
  //   response.setHeader('Set-Cookie', this.authService.getCookieForLogOut());
  //   return response.sendStatus(200);
  // }
}
