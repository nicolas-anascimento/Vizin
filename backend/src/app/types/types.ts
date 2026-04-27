type userDataType =
  | any
  | {
      id: number;
      name: string;
      email: string;
      password: string;
    };

type userBodyLoginType = {
  email: string;
  password: string;
};

type userBodyRegisterType = {
  name: string;
  email: string;
  password: string;
  cpf: string;
  phone: string;
}

export type { userDataType, userBodyLoginType, userBodyRegisterType };
