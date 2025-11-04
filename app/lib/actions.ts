'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}


const sql = postgres(process.env.POSTGRES_URL!, {ssl: 'require'});

const formSchema = z.object({
    id: z.string(),
    customerId: z.string({ invalid_type_error: 'Please select a customer' }),
    amount: z.coerce.number().gt(0, { message: 'Please enter an amount greater tahn $0.' }),
    status: z.enum(['pending', 'paid'], { invalid_type_error: 'Please select an invoice status' }),
    date: z.string(),
});

// customerId - O Zod já gera um erro se o campo do cliente estiver vazio, pois espera um tipo string. Mas vamos adicionar uma mensagem amigável se o usuário não selecionar um cliente.

// amount - Já que você está coagindo o tipo de valor de string para number, o padrão será zero se a string estiver vazia. Vamos dizer ao Zod que sempre queremos a quantidade maior que 0 com o .gt() função.

// status- O Zod já gera um erro se o campo de status estiver vazio, pois espera "pendente" ou "pago". Vamos também adicionar uma mensagem amigável se o usuário não selecionar um status.

const CreateInvoice = formSchema.omit({ id: true, date: true });

export type State = {
  errors?: {
    customerId?: string[],
    amount?: string[],
    status?: string[],
  };
  message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {

    // validate with zod
    const validatedFields = CreateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    // If form validation fails, return errors early. Otherwise, continue.
    if (!validatedFields.success) {
      return {
        errors: validatedFields.error.flatten().fieldErrors,
        message: 'Missing Fields. Failed to Create Invoice.',
      }
    }

    // Prepare data for insertion into the database
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];

    try {
      await sql`
        INSERT INTO invoices (customer_id, amount, status, date)
        VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
      `;
    } catch (error) {
      return { message: 'Database Error: Failed to Create Invoice' }
    }
    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
};

//-----------------------------------------------------------------------------

const UpdateInvoice = formSchema.omit({ id: true, date: true });
 
export async function updateInvoice(id: string, prevState: State, formData: FormData) {
    
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if(!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    }
  }
  
  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
 
  try {
    await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `;
  } catch (error) {
    console.log(error);
    return { message: 'Database Error: Failed to Update Invoice' }
  }
 
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

//-------------------------------------------------------------------------------

export async function deleteInvoice(id: string) {
  throw new Error('Failed to Delete Invoice')
  await sql`DELETE FROM invoices WHERE id = ${id}`;
  revalidatePath('/dashboard/invoices');
}
